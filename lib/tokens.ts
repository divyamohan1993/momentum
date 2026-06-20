import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./config";

/** Short-lived signed token for push notification action buttons (H4). */
function key(): Uint8Array {
  return new TextEncoder().encode(env().sessionSecret);
}

export async function signActionToken(taskId: string): Promise<string> {
  return new SignJWT({ t: taskId, k: "action" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key());
}

export async function verifyActionToken(token: string, taskId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.k === "action" && payload.t === taskId;
  } catch {
    return false;
  }
}
