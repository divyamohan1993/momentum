import "server-only";
import { GoogleAuth } from "google-auth-library";
import { env } from "./config";

/**
 * Cloud Tasks (event-driven reminders). One task is scheduled at each reminder's exact
 * fire time — so when nothing is due and the app is closed, NOTHING runs. No cron, no idle
 * compute, structurally ₹0. Uses the REST API with the runtime SA's ADC token (no extra dep).
 */
const auth = new GoogleAuth({ scopes: "https://www.googleapis.com/auth/cloud-platform" });
const MAX_DELAY_MS = 29 * 86_400_000; // Cloud Tasks caps scheduleTime at 30 days out

export function tasksEnabled(): boolean {
  return !!env().appBaseUrl && !!env().sweepInvokerSa;
}

async function tasksApi(pathOrName: string, method: string, body?: unknown): Promise<{ name?: string } | null> {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const res = await fetch(`https://cloudtasks.googleapis.com/v2/${pathOrName}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404 || res.status === 409) return null; // already gone / already exists
  if (!res.ok) throw new Error(`cloudtasks ${method} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json().catch(() => ({}))) as { name?: string };
}

/** Schedule a fire callback for one reminder. Returns the Cloud Task name (cancellation handle). */
export async function enqueueFire(taskId: string, fireAtIso: string): Promise<string | null> {
  if (!tasksEnabled()) return null;
  const e = env();
  const parent = `projects/${e.gcpProject}/locations/${e.tasksLocation}/queues/${e.tasksQueue}`;
  const url = `${e.appBaseUrl}/api/fire`;
  const delay = new Date(fireAtIso).getTime() - Date.now();
  const scheduleTime = new Date(Date.now() + Math.min(Math.max(delay, 0), MAX_DELAY_MS)).toISOString();
  const r = await tasksApi(`${parent}/tasks`, "POST", {
    task: {
      scheduleTime,
      httpRequest: {
        url,
        httpMethod: "POST",
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ taskId })).toString("base64"),
        oidcToken: { serviceAccountEmail: e.sweepInvokerSa, audience: url },
      },
    },
  });
  return r?.name ?? null;
}

export async function deleteFire(cloudTaskName: string | undefined | null): Promise<void> {
  if (!cloudTaskName || !tasksEnabled()) return;
  try {
    await tasksApi(cloudTaskName, "DELETE");
  } catch {
    /* already dispatched/removed — fine */
  }
}
