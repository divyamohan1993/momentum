import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./config";
import { encryptField, decryptField } from "./field-cipher";
function key() {
  const k = Buffer.from(env().fieldKey, "base64");
  if (k.length !== 32) throw new Error("FIELD_KEY must contain 32 bytes");
  return k;
}
export function encField(plain: string | undefined | null, owner: string): string | undefined {
  if (plain == null || plain === "") return plain ?? undefined;
  return encryptField(plain, key(), owner);
}
export function decField(stored: string | undefined | null, owner: string): string | undefined {
  if (stored == null || stored === "") return stored ?? undefined;
  return decryptField(stored, key(), owner, owner === env().ownerEmail);
}
export function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
