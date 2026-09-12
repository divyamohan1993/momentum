import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

export const opaqueToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("base64url");
function mac(raw: string, secret: string) {
  return createHmac("sha256", secret).update(`momentum-login-csrf:v1:${raw}`).digest("base64url");
}
export function createLoginProof(secret: string, now = Date.now()) {
  const nonce = opaqueToken();
  const raw = `${nonce}.${now}`;
  return { nonce, cookie: `${raw}.${mac(raw, secret)}` };
}
export function verifyLoginProof(cookie: string | undefined, nonce: unknown, secret: string, now = Date.now()): boolean {
  if (!cookie || typeof nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || cookie.length > 160) return false;
  const [n, timestamp, signature, extra] = cookie.split(".");
  const issued = Number(timestamp);
  if (extra || n !== nonce || !signature || !Number.isSafeInteger(issued) || issued > now || now - issued > 300_000) return false;
  const expected = Buffer.from(mac(`${n}.${timestamp}`, secret));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionCredential(secret: string): string {
  const id = opaqueToken();
  return id + "." + createHmac("sha256", secret).update("momentum-session:v2:" + id).digest("base64url");
}
export function validSessionCredential(token: string | undefined, secret: string): token is string {
  if (!token || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [id, supplied] = token.split(".");
  const expected = createHmac("sha256", secret).update("momentum-session:v2:" + id).digest();
  const actual = Buffer.from(supplied!, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createDeviceCredential(secret: string): string {
  const id = opaqueToken();
  return id + "." + createHmac("sha256", secret).update("momentum-device:v1:" + id).digest("base64url");
}
export function validDeviceCredential(token: string | undefined, secret: string): token is string {
  if (!token || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [id, supplied] = token.split(".");
  const expected = createHmac("sha256", secret).update("momentum-device:v1:" + id).digest();
  const actual = Buffer.from(supplied!, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
