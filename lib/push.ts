import "server-only";
import webpush from "web-push";
import { env, pushEnabled } from "./config";
import { listPushSubs, removePushSub, coll, workspaceMeta, adminApp } from "./store";
import { getAuth } from "firebase-admin/auth";
import { allowedPushEndpoint, deviceMatchesWorkspace } from "./workspace-policy";
import type { Task } from "./types";
import { formatIst } from "./time";

let configured = false;
function ensure() {
  if (!configured && pushEnabled()) {
    webpush.setVapidDetails(env().vapidSubject, env().vapidPublic, env().vapidPrivate);
    configured = true;
  }
}

export async function sendPushToUser(owner: string, payload: Record<string, unknown>): Promise<{ sent: number; failed: number }> {
  if (!pushEnabled()) return { sent: 0, failed: 0 };
  ensure();
  const profile = (await workspaceMeta(owner, "profile").get()).data();
  if (!profile?.uid) return { sent: 0, failed: 0 };
  const account = await getAuth(adminApp()).getUser(profile.uid);
  if (account.disabled || !account.emailVerified) return { sent: 0, failed: 0 };
  const google = account.providerData.find((p) => p.providerId === "google.com");
  const subs = await listPushSubs(owner);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        if (!s.deviceHash || !allowedPushEndpoint(s.endpoint)) return;
        const device = (await coll("devices").doc(s.deviceHash).get()).data();
        if (!deviceMatchesWorkspace(owner, device) || google?.uid !== device?.googleSub
          || (account.tokensValidAfterTime && device!.authTime * 1000 < Date.parse(account.tokensValidAfterTime))) return;
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await removePushSub(owner, s.endpoint); // gone — prune
      }
    }),
  );
  return { sent, failed };
}

/** Build the notification payload for a reminder fire. Rung 1 is the "alarm" rung. */
export function reminderPayload(task: Task, rung: number, clickToken: string): Record<string, unknown> {
  const alarm = rung >= 1;
  const due = task.dueAt ? `Due ${formatIst(task.dueAt)}` : "Needs attention";
  return {
    kind: "reminder",
    title: `${alarm ? "🚨" : "⏳"} ${task.title}`,
    body: alarm ? `${due} · still not started. Tap to act.` : due,
    tag: `task-${task.id}`,
    renotify: true,
    requireInteraction: alarm,
    alarm,
    taskId: task.id,
    token: clickToken,
    url: `/?focus=${task.id}`,
    actions: [
      { action: "done", title: "✓ Done" },
      { action: "snooze", title: "💤 Snooze 1h" },
    ],
  };
}
