import { createHash } from "node:crypto";

export function workspaceFor(uid: string, legacyUid: string, legacyEmail: string): string {
  if (!uid || uid.length > 128) throw new Error("Invalid identity");
  // Keep existing task IDs and queued reminders intact without reassigning by email.
  if (legacyUid && uid === legacyUid) return legacyEmail;
  return `user_${createHash("sha256").update(uid).digest("hex")}`;
}
export const workspaceKey = (owner: string) => createHash("sha256").update(owner).digest("hex");
export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length > 64) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); return true; } catch { return false; }
}
export function ownsRecord(owner: string, record: { ownerId?: unknown } | undefined): boolean {
  return !!owner && record?.ownerId === owner;
}
export function allowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    const host = u.hostname;
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash
      && (host === "fcm.googleapis.com" || host === "web.push.apple.com"
        || host === "updates.push.services.mozilla.com"
        || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host));
  } catch { return false; }
}
export function deviceMatchesWorkspace(owner: string, device: { owner?: unknown; expiresAt?: number } | undefined, now = Date.now()): boolean {
  return !!device && device.owner === owner && typeof device.expiresAt === "number" && device.expiresAt > now;
}
