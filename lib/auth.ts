import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { verify as argonVerify } from "@node-rs/argon2";
import { cookies } from "next/headers";
import { env } from "./config";
import { safeEqual } from "./crypto";
import {
  getLoginLock,
  recordLoginFail,
  clearLoginFails,
  getMinIat,
  audit,
} from "./store";

export const SESSION_COOKIE = "momentum_session";
const SESSION_SECONDS = 7 * 24 * 3600;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().sessionSecret);
}

// ── session token ──
export async function signSession(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: env().ownerEmail })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_SECONDS)
    .sign(secretKey());
}

// minIat cached 60s so requireOwner does NOT hit Firestore on every request (₹0 reads).
let _minIat = { v: 0, exp: 0 };
async function minIatCached(): Promise<number> {
  if (Date.now() < _minIat.exp) return _minIat.v;
  const v = await getMinIat();
  _minIat = { v, exp: Date.now() + 60_000 };
  return v;
}

export async function ownerFromToken(token?: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if ((payload.sub as string)?.toLowerCase() !== env().ownerEmail) return null;
    if ((payload.iat ?? 0) < (await minIatCached())) return null; // revoked
    return env().ownerEmail;
  } catch {
    return null;
  }
}

export async function currentOwner(): Promise<string | null> {
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  return ownerFromToken(c);
}

const SECURE_COOKIE = process.env.NODE_ENV === "production";
export function sessionCookie(value: string) {
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: SECURE_COOKIE,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
export function clearCookie() {
  return { name: SESSION_COOKIE, value: "", httpOnly: true, secure: SECURE_COOKIE, sameSite: "lax" as const, path: "/", maxAge: 0 };
}

// ── cheap in-memory IP token bucket (runs BEFORE Argon2id; review B4/B5) ──
const buckets = new Map<string, { tokens: number; last: number }>();
const BUCKET_CAP = 5;
const REFILL_PER_SEC = 0.2; // ~1 token / 5s
export function loginRateOk(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: BUCKET_CAP, last: now };
  b.tokens = Math.min(BUCKET_CAP, b.tokens + ((now - b.last) / 1000) * REFILL_PER_SEC);
  b.last = now;
  if (buckets.size > 5000) buckets.clear(); // crude bound; single-owner tool
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

export function getIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export type LoginResult = { ok: boolean; reason?: string; retryAfter?: number };

export async function attemptLogin(passphrase: string, ip: string): Promise<LoginResult> {
  if (!loginRateOk(ip)) return { ok: false, reason: "rate", retryAfter: 5 };
  const lock = await getLoginLock();
  if (lock.lockedUntil > Date.now())
    return { ok: false, reason: "locked", retryAfter: Math.ceil((lock.lockedUntil - Date.now()) / 1000) };

  let valid = false;
  try {
    valid = await argonVerify(env().ownerPassphraseHash, passphrase);
  } catch {
    valid = false;
  }
  if (!valid) {
    const until = await recordLoginFail();
    await audit("login_fail", { ip });
    return { ok: false, reason: "invalid", retryAfter: until ? Math.ceil((until - Date.now()) / 1000) : undefined };
  }
  await clearLoginFails();
  await audit("login_ok", { ip });
  return { ok: true };
}

// ── boundary checks ──
/** When EDGE_SECRET is set (behind Cloudflare), require the injected header (review B3). */
export function edgeOk(req: Request): boolean {
  const s = env().edgeSecret;
  if (!s) return true;
  return safeEqual(req.headers.get("x-edge-auth") ?? "", s);
}

/** CSRF guard for mutating route handlers (H1): same-origin only. */
export function originOk(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin) return !site; // non-browser client (curl, OIDC) — allowed past CSRF, still auth-gated
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** One guard to rule them all — call first in every protected handler (H5). */
export async function guard(
  req: Request,
  opts: { mutation?: boolean } = {},
): Promise<{ owner: string } | { res: Response }> {
  if (!edgeOk(req)) return { res: new Response("forbidden", { status: 403 }) };
  if (opts.mutation && !originOk(req))
    return { res: Response.json({ error: "bad origin" }, { status: 403 }) };
  const owner = await currentOwner();
  if (!owner) return { res: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { owner };
}
