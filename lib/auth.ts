import "server-only";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { env } from "./config";
import { safeEqual } from "./crypto";
import { adminApp, adminDb, coll, audit, workspaceMeta, ensureWorkspace } from "./store";
import { createSessionCredential, validSessionCredential, createDeviceCredential, validDeviceCredential, tokenHash } from "./login-proof";
import { SESSION_COOKIE, SESSION_SECONDS, DEVICE_COOKIE, googleIdentityAllowed, originAllowed, sessionAllowed, type BrowserSession } from "./auth-policy";
export { SESSION_COOKIE } from "./auth-policy";

import { workspaceFor, deviceMatchesWorkspace } from "./workspace-policy";
type Session = BrowserSession & { owner: string; email: string; googleSub: string; deviceHash: string };
export type Identity = { uid: string; owner: string; email: string; googleSub: string; deviceHash: string };
const sessionRef = (hash: string) => coll("sessions").doc(hash);
const workspaceOf = (uid: string) => workspaceFor(uid, env().ownerGoogleUid, env().ownerEmail);

/** Google verifies identity; the session's workspace is derived exclusively on the server. */
export async function createGoogleSession(idToken: string, timeZone?: string): Promise<{ token: string; device: string }> {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.NODE_ENV === "production") throw new Error("auth unavailable");
  const claims = await getAuth(adminApp()).verifyIdToken(idToken, true);
  if (!googleIdentityAllowed(claims, env().gcpProject)) throw new Error("access denied");
  const googleSub = claims.firebase.identities["google.com"][0] as string;
  if (claims.uid === env().ownerGoogleUid && (googleSub !== env().ownerGoogleSub || claims.email?.toLowerCase() !== env().ownerEmail)) throw new Error("Legacy identity mismatch");
  const owner = workspaceOf(claims.uid);
  const email = claims.email!.toLowerCase();
  await ensureWorkspace(owner, { uid: claims.uid, email, googleSub, displayName: typeof claims.name === "string" ? claims.name.slice(0, 80) : email.split("@")[0]! }, timeZone);
  const previousDevice = (await cookies()).get(DEVICE_COOKIE)?.value;
  const device = validDeviceCredential(previousDevice, env().sessionSecret) ? previousDevice : createDeviceCredential(env().sessionSecret);
  const deviceHash = tokenHash(device);
  const token = createSessionCredential(env().sessionSecret), now = Date.now();
  const session: Session = { hash: tokenHash(token), uid: claims.uid, owner, email, googleSub, deviceHash, createdAt: now, expiresAt: now + SESSION_SECONDS * 1000, authTime: claims.auth_time };
  await adminDb().runTransaction(async (tx) => {
    const ref = workspaceMeta(owner, "auth");
    const d = (await tx.get(ref)).data() ?? {};
    const exchanges: { hash: string; expiresAt: number }[] = (d.exchanges ?? []).filter((e: { expiresAt: number }) => e.expiresAt > now);
    const exchangeHash = tokenHash(idToken);
    if (exchanges.some((e) => e.hash === exchangeHash) || exchanges.length >= 20) throw new Error("Sign-in used or limited");
    const existing: { hash: string; expiresAt: number }[] = d.sessions ?? [];
    const live = existing.filter((s) => s.expiresAt > now).slice(-4);
    for (const old of existing) if (!live.some((s) => s.hash === old.hash)) tx.delete(sessionRef(old.hash));
    tx.set(sessionRef(session.hash), session);
    tx.set(coll("devices").doc(deviceHash), { owner, uid: claims.uid, googleSub, email, authTime: claims.auth_time, updatedAt: now, expiresAt: now + 180 * 86_400_000 });
    tx.set(ref, { sessions: [...live, { hash: session.hash, expiresAt: session.expiresAt }], exchanges: [...exchanges, { hash: exchangeHash, expiresAt: claims.exp * 1000 }] });
  });
  await audit("google_login_ok", { workspace: tokenHash(owner) });
  return { token, device };
}

async function identityFromToken(token?: string): Promise<Identity | null> {
  const denied = (reason: string): null => { if (process.env.NODE_ENV === "development") console.warn(JSON.stringify({ event: "session_denied", reason })); return null; };
  // Cheap authenticity check stops random unauthenticated cookies generating database reads.
  if (!validSessionCredential(token, env().sessionSecret)) return denied("credential");
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!validDeviceCredential(device, env().sessionSecret)) return denied("device_credential");
  try {
    const s = (await sessionRef(tokenHash(token)).get()).data() as Session | undefined;
    if (!s) return denied("missing_session");
    if (!sessionAllowed(s, s.uid)) return denied("session_expiry");
    if (workspaceOf(s.uid) !== s.owner) return denied("workspace_binding");
    if (s.deviceHash !== tokenHash(device)) return denied("session_device_binding");
    const binding = (await coll("devices").doc(s.deviceHash).get()).data();
    if (!deviceMatchesWorkspace(s.owner, binding)) return denied("device_owner");
    const user = await getAuth(adminApp()).getUser(s.uid);
    const google = user.providerData.find((p) => p.providerId === "google.com");
    if (user.disabled || !user.emailVerified || user.email?.toLowerCase() !== s.email || google?.uid !== s.googleSub
      || (user.tokensValidAfterTime && s.authTime * 1000 < Date.parse(user.tokensValidAfterTime))) return denied("google_identity");
    return { uid: s.uid, owner: s.owner, email: s.email, googleSub: s.googleSub, deviceHash: s.deviceHash };
  } catch { return denied("store_or_identity_unavailable"); }
}
export async function ownerFromToken(token?: string): Promise<string | null> { return (await identityFromToken(token))?.owner ?? null; }
export async function currentIdentity(): Promise<Identity | null> {
  return identityFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function currentOwner(): Promise<string | null> { return (await currentIdentity())?.owner ?? null; }
export async function revokeCurrentSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!validSessionCredential(token, env().sessionSecret)) return;
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!validDeviceCredential(device, env().sessionSecret)) return;
  const ref = sessionRef(tokenHash(token));
  await adminDb().runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() as Session | undefined;
    if (!s || s.deviceHash !== tokenHash(device)) return;
    const deviceRef = coll("devices").doc(s.deviceHash);
    const binding = (await tx.get(deviceRef)).data();
    tx.delete(ref);
    if (binding?.owner === s.owner) tx.set(deviceRef, { owner: null }, { merge: true });
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

export async function guard(req: Request, opts: { mutation?: boolean } = {}): Promise<{ owner: string; user: Identity } | { res: Response }> {
  if (!edgeOk(req)) return { res: new Response("forbidden", { status: 403 }) };
  if (opts.mutation && !originOk(req)) return { res: Response.json({ error: "bad origin" }, { status: 403 }) };
  const user = await currentIdentity();
  return user ? { owner: user.owner, user } : { res: Response.json({ error: "unauthorized" }, { status: 401 }) };
}


/** A notification action needs both its task capability and the account-bound device. */
export async function deviceMayAct(owner: string): Promise<boolean> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!validDeviceCredential(token, env().sessionSecret)) return false;
  try {
    const d = (await coll("devices").doc(tokenHash(token)).get()).data();
    if (!d || !deviceMatchesWorkspace(owner, d)) return false;
    const user = await getAuth(adminApp()).getUser(d.uid);
    return !user.disabled && user.emailVerified && user.providerData.some((p) => p.providerId === "google.com" && p.uid === d.googleSub)
      && (!user.tokensValidAfterTime || d.authTime * 1000 >= Date.parse(user.tokensValidAfterTime));
  } catch { return false; }
}
