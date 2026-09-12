import "server-only";
import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./config";

/** Short-lived signed token for push notification action buttons (H4). */
function key(): Uint8Array {
  return createHmac("sha256", env().sessionSecret).update("momentum:notification-actions:v2").digest();
}

export async function signActionToken(owner: string, taskId: string): Promise<string> {
  return new SignJWT({ t: taskId, k: "action", sub: owner })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("momentum:notification-actions")
    .setAudience("momentum:notification-actions")
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key());
}

export async function verifyActionToken(token: string, taskId: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], issuer: "momentum:notification-actions", audience: "momentum:notification-actions" });
    return payload.k === "action" && payload.t === taskId && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
