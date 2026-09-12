import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "node:crypto";
function scopedKey(master: Buffer, owner: string): Buffer {
  if (master.length !== 32 || !owner) throw new Error("Invalid encryption context");
  return Buffer.from(hkdfSync("sha256", master, Buffer.from("momentum-workspaces-v2"), Buffer.from(owner), 32));
}
export function encryptField(plain: string, master: Buffer, owner: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scopedKey(master, owner), iv);
  cipher.setAAD(Buffer.from(`momentum-field:${owner}`));
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v2:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function decryptField(stored: string, master: Buffer, owner: string, legacyAllowed = false): string {
  const scoped = stored.startsWith("v2:");
  if (!scoped && !legacyAllowed) throw new Error("Invalid workspace field");
  if (!scoped && !stored.startsWith("v1:")) return stored;
  const data = Buffer.from(stored.slice(3), "base64url");
  if (data.length < 28) throw new Error("Invalid encrypted field");
  const decipher = createDecipheriv("aes-256-gcm", scoped ? scopedKey(master, owner) : master, data.subarray(0, 12));
  if (scoped) decipher.setAAD(Buffer.from(`momentum-field:${owner}`));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
