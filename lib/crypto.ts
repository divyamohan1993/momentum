import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./config";

/**
 * Field-level AES-256-GCM (review B6 / CLAUDE.md crypto bar). Sensitive text fields
 * (title, description, blockedReason) are encrypted at rest so that even with full read
 * access to the shared `(default)` Firestore DB, the plaintext is never exposed.
 *
 * Stored format: `v1:<base64url( iv(12) | authTag(16) | ciphertext )>`.
 * Key: 32 bytes, base64 in env `FIELD_KEY` (Secret Manager).
 */
const PREFIX = "v1:";

function key(): Buffer {
  const raw = Buffer.from(env().fieldKey, "base64");
  if (raw.length !== 32) {
    throw new Error("FIELD_KEY must be 32 bytes (base64). Got " + raw.length);
  }
  return raw;
}

export function encField(plain: string | undefined | null): string | undefined {
  if (plain == null || plain === "") return plain ?? undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64url");
}

export function decField(stored: string | undefined | null): string | undefined {
  if (stored == null || stored === "") return stored ?? undefined;
  if (!stored.startsWith(PREFIX)) return stored; // tolerate legacy/plaintext during migration
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Constant-time string compare for secrets/tokens (edge header, click tokens). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
