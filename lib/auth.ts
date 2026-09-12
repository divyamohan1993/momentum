import "server-only";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { env } from "./config";
import { safeEqual } from "./crypto";
import { adminApp, adminDb, coll, audit } from "./store";
import { opaqueToken, tokenHash } from "./login-proof";
import { SESSION_COOKIE, SESSION_SECONDS, ownerIdentityAllowed, originAllowed, sessionAllowed, type BrowserSession } from "./auth-policy";
export { SESSION_COOKIE } from "./auth-policy";

const ownerIdentity = () => ({ email: env().ownerEmail, uid: env().ownerGoogleUid, googleSub: env().ownerGoogleSub, project: env().gcpProject });
const sessionRef = () => coll("meta").doc("browser_sessions");

/** Only a recent, verified, non-revoked Google sign-in for the pinned owner can issue a session. */
export async function createGoogleSession(idToken: string): Promise<string> {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.NODE_ENV === "production") throw new Error("auth unavailable");
  const claims = await getAuth(adminApp()).verifyIdToken(idToken, true);
  if (!ownerIdentityAllowed(claims, ownerIdentity())) throw new Error("access denied");
  const token = opaqueToken();
  const now = Date.now();
  const session: BrowserSession = { hash: tokenHash(token), uid: env().ownerGoogleUid, createdAt: now, expiresAt: now + SESSION_SECONDS * 1000, authTime: claims.auth_time };
  const exchangeHash = tokenHash(idToken);
  await adminDb().runTransaction(async (tx) => {
    const ref = sessionRef();
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const exchanges: { hash: string; expiresAt: number }[] = (d.exchanges ?? []).filter((e: { expiresAt: number }) => e.expiresAt > now);
    if (exchanges.some((e) => e.hash === exchangeHash) || exchanges.length >= 20) throw new Error("sign-in already used or limited");
    const sessions: BrowserSession[] = (d.sessions ?? []).filter((s: BrowserSession) => sessionAllowed(s, env().ownerGoogleUid, now));
    tx.set(ref, { sessions: [...sessions.slice(-4), session], exchanges: [...exchanges, { hash: exchangeHash, expiresAt: claims.exp * 1000 }] });
  });
  await audit("google_login_ok");
  return token;
}

export async function ownerFromToken(token?: string): Promise<string | null> {
  // Old password JWTs, Firebase tokens and notification tokens are never portal sessions.
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const snap = await sessionRef().get();
    const sessions: BrowserSession[] = snap.data()?.sessions ?? [];
    const s = sessions.find((entry) => entry.hash === tokenHash(token));
    if (!sessionAllowed(s, env().ownerGoogleUid)) return null;
    // Check disablement and Firebase revocation on every request; no cross-request cache.
    const user = await getAuth(adminApp()).getUser(env().ownerGoogleUid);
    const google = user.providerData.find((p) => p.providerId === "google.com");
    if (user.disabled || !user.emailVerified || user.email?.toLowerCase() !== env().ownerEmail
      || google?.uid !== env().ownerGoogleSub
      || (user.tokensValidAfterTime && s!.authTime * 1000 < Date.parse(user.tokensValidAfterTime))) return null;
    return env().ownerEmail;
  } catch { return null; }
}

export async function currentOwner(): Promise<string | null> {
  return ownerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function revokeCurrentSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await adminDb().runTransaction(async (tx) => {
    const ref = sessionRef();
    const d = (await tx.get(ref)).data();
    if (!d) return;
    tx.update(ref, { sessions: (d.sessions ?? []).filter((s: BrowserSession) => s.hash !== tokenHash(token)) });
  });
}

export function sessionCookie(value: string) {
  return { name: SESSION_COOKIE, value, httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: SESSION_SECONDS };
}
export function clearCookie() { return { ...sessionCookie(""), maxAge: 0 }; }

// Public login endpoints get a bounded global bucket before cryptography/Google calls.
// This complements the durable owner-only exchange cap and Vertex's separate hard budget.
let bucket = { tokens: 20, last: Date.now() };
export function loginRateOk(): boolean {
  const now = Date.now();
  bucket.tokens = Math.min(20, bucket.tokens + (now - bucket.last) / 3000);
  bucket.last = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}

export function edgeOk(req: Request): boolean {
  const s = env().edgeSecret;
  return !s || safeEqual(req.headers.get("x-edge-auth") ?? "", s);
}
export function originOk(req: Request): boolean { return originAllowed(req, env().appOrigin); }

export async function guard(req: Request, opts: { mutation?: boolean } = {}): Promise<{ owner: string } | { res: Response }> {
  if (!edgeOk(req)) return { res: new Response("forbidden", { status: 403 }) };
  if (opts.mutation && !originOk(req)) return { res: Response.json({ error: "bad origin" }, { status: 403 }) };
  const owner = await currentOwner();
  return owner ? { owner } : { res: Response.json({ error: "unauthorized" }, { status: 401 }) };
}
