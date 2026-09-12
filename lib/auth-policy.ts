/** Pure authorization policy. Identity claims must be cryptographically verified first. */
export const SESSION_COOKIE = "__Host-momentum_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export const LOGIN_COOKIE = "__Host-momentum_login";
export const LOGIN_SECONDS = 300;

export type OwnerIdentity = { email: string; uid: string; googleSub: string; project: string };
export function ownerIdentityAllowed(p: Record<string, any>, owner: OwnerIdentity, now = Math.floor(Date.now() / 1000)): boolean {
  return !!owner.uid && !!owner.googleSub && !!owner.email && !!owner.project
    && p.aud === owner.project && p.iss === `https://securetoken.google.com/${owner.project}`
    && p.sub === owner.uid && p.uid === owner.uid
    && typeof p.email === "string" && p.email.toLowerCase() === owner.email.toLowerCase()
    && p.email_verified === true && !p.firebase?.tenant
    && p.firebase?.sign_in_provider === "google.com"
    && Array.isArray(p.firebase?.identities?.["google.com"])
    && p.firebase.identities["google.com"].includes(owner.googleSub)
    && Number.isSafeInteger(p.auth_time) && p.auth_time <= now + 30 && now - p.auth_time <= LOGIN_SECONDS
    && Number.isSafeInteger(p.iat) && p.iat <= now + 30 && now - p.iat <= LOGIN_SECONDS
    && p.auth_time <= p.iat + 30
    && Number.isSafeInteger(p.exp) && p.exp > now && p.exp - p.iat <= 3630;
}

export function originAllowed(req: Request, configuredOrigin: string): boolean {
  try {
    const allowed = new URL(configuredOrigin);
    return allowed.origin === configuredOrigin && req.headers.get("origin") === configuredOrigin
      && !["cross-site", "same-site"].includes(req.headers.get("sec-fetch-site") ?? "");
  } catch { return false; }
}

export type BrowserSession = { hash: string; uid: string; createdAt: number; expiresAt: number; authTime: number };
export function sessionAllowed(s: BrowserSession | undefined, uid: string, now = Date.now()): boolean {
  return !!s && !!uid && s.uid === uid && /^[A-Za-z0-9_-]{43}$/.test(s.hash)
    && Number.isSafeInteger(s.createdAt) && s.createdAt <= now
    && Number.isSafeInteger(s.expiresAt) && s.expiresAt > now
    && s.expiresAt <= s.createdAt + SESSION_SECONDS * 1000
    && Number.isSafeInteger(s.authTime) && s.authTime * 1000 <= s.createdAt + 30_000;
}
