import "server-only";
import { adminDb, coll, getTask, audit } from "./store";
import { sendPushToUser, reminderPayload } from "./push";
import { signActionToken } from "./tokens";
import { enqueueFire, deleteFire } from "./tasks";
import { ownsRecord } from "./workspace-policy";
import { nowUtcIso } from "./time";
import {
  type Task,
  type Status,
  ESCALATION_INTERVALS,
  RUNG0_REPEAT_MINUTES,
  RUNG0_MAX_REPEATS,
} from "./types";

/**
 * Event-driven reminder/escalation engine. Each reminder schedules ONE Cloud Task at its exact
 * fire time (lib/tasks). Nothing due + app closed => nothing runs => structurally ₹0 (no cron).
 * Idempotency (review §2): the fire is a transactional claim that re-reads task status in-txn and
 * advances fireAt, so a redelivered task no-ops. One reminder doc per task (id == taskId).
 */
const RUNG1_SAFETY_CAP = 3;

type ReminderDoc = {
  ownerId: string;
  taskId: string;
  dueAtSnapshot: string;
  fireAt: string;
  currentRung: number;
  repeatCount: number;
  status: "pending" | "sent" | "acknowledged" | "paused" | "cancelled";
  active: boolean;
  cloudTaskName?: string | null;
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string;
};

const rref = (taskId: string) => coll("reminders").doc(taskId);

// ── Cloud Task scheduling (network, outside transactions) ──
async function scheduleFire(owner: string, taskId: string, fireAtIso: string): Promise<void> {
  const ref = rref(taskId);
  const snap = await ref.get();
  if (!snap.exists || !ownsRecord(owner, snap.data())) return;
  const old = snap.exists ? (snap.data() as ReminderDoc).cloudTaskName : undefined;
  if (old) await deleteFire(old);
  const name = await enqueueFire(taskId, fireAtIso);
  await ref.set({ cloudTaskName: name ?? null, updatedAt: nowUtcIso() }, { merge: true });
}
async function cancelFire(owner: string, taskId: string): Promise<void> {
  const ref = rref(taskId);
  const snap = await ref.get();
  if (!snap.exists || !ownsRecord(owner, snap.data())) return;
  const old = (snap.data() as ReminderDoc).cloudTaskName;
  if (old) await deleteFire(old);
  await ref.set({ cloudTaskName: null, updatedAt: nowUtcIso() }, { merge: true });
}

/** Reconcile a reminder to its task's state. Call after every task create/update. */
export async function syncReminderForTask(owner: string, task: Task): Promise<void> {
  if (!ownsRecord(owner, task)) throw new Error("Task owner mismatch");
  if (!task.remindersEnabled) return void (await disable(owner, task.id, "cancelled"));
  if (task.deletedAt) return void (await disable(owner, task.id, "cancelled"));
  if (task.status === "done") return void (await disable(owner, task.id, "acknowledged"));
  if (task.status === "in_progress") return void (await pause(owner, task.id));
  return arm(owner, task);
}

async function arm(owner: string, task: Task): Promise<void> {
  const decision = await adminDb().runTransaction(async (tx): Promise<{ schedule?: string; cancel?: boolean }> => {
    const ref = rref(task.id);
    const s = await tx.get(ref);
    const now = nowUtcIso();
    if (s.exists && !ownsRecord(owner, s.data())) return {};
    if (!task.dueAt) {
      if (s.exists) tx.set(ref, { status: "cancelled", active: false, updatedAt: now }, { merge: true });
      return { cancel: s.exists };
    }
    if (!s.exists) {
      tx.set(ref, {
        ownerId: owner, taskId: task.id, dueAtSnapshot: task.dueAt, fireAt: task.dueAt,
        currentRung: 0, repeatCount: 0, status: "pending", active: true, cloudTaskName: null,
        createdAt: now, updatedAt: now,
      } as ReminderDoc);
      return { schedule: task.dueAt };
    }
    const d = s.data() as ReminderDoc;
    if (d.dueAtSnapshot !== task.dueAt) {
      tx.set(ref, { dueAtSnapshot: task.dueAt, fireAt: task.dueAt, currentRung: 0, repeatCount: 0, status: "pending", active: true, updatedAt: now }, { merge: true });
      return { schedule: task.dueAt };
    }
    if (d.status === "paused" || d.status === "cancelled" || d.status === "acknowledged") {
      tx.set(ref, { status: "pending", active: true, fireAt: task.dueAt, updatedAt: now }, { merge: true });
      return { schedule: task.dueAt };
    }
    return {}; // active, same deadline — keep the existing scheduled task
  });
  if (decision.schedule) await scheduleFire(owner, task.id, decision.schedule);
  else if (decision.cancel) await cancelFire(owner, task.id);
}

async function pause(owner: string, taskId: string): Promise<void> {
  const ref = rref(taskId);
  const changed = await adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || !ownsRecord(owner, s.data())) return false;
    const d = s.data() as ReminderDoc;
    if (d.status === "pending" || d.status === "sent") {
      tx.set(ref, { status: "paused", active: false, updatedAt: nowUtcIso() }, { merge: true });
      return true;
    }
    return false;
  });
  if (changed) await cancelFire(owner, taskId);
}

async function disable(owner: string, taskId: string, status: "acknowledged" | "cancelled"): Promise<void> {
  const s = await rref(taskId).get();
  if (!s.exists || !ownsRecord(owner, s.data())) return;
  await rref(taskId).set({ status, active: false, updatedAt: nowUtcIso() }, { merge: true });
  await cancelFire(owner, taskId);
}

export async function acknowledge(owner: string, taskId: string): Promise<void> {
  await disable(owner, taskId, "acknowledged");
  await audit("reminder_ack", { taskId });
}

export async function snooze(owner: string, taskId: string): Promise<void> {
  const ref = rref(taskId);
  const s = await ref.get();
  if (!s.exists || !ownsRecord(owner, s.data())) return;
  const fireAt = new Date(Date.now() + 3_600_000).toISOString();
  await ref.set({ fireAt, currentRung: 0, repeatCount: 0, status: "pending", active: true, updatedAt: nowUtcIso() }, { merge: true });
  await scheduleFire(owner, taskId, fireAt);
  await audit("reminder_snooze", { taskId });
}

export async function unacknowledgedCount(owner: string): Promise<number> {
  const snap = await coll("reminders").where("ownerId", "==", owner).where("active", "==", true).get();
  const now = Date.now();
  return snap.docs.filter((d) => {
    const r = d.data() as ReminderDoc;
    return r.status === "sent" || (r.status === "pending" && new Date(r.fireAt).getTime() <= now);
  }).length;
}

type FireResult =
  | { status: "fired"; rung: number; nextFireAt: string | null; active: boolean }
  | { status: "not_due"; fireAt: string }
  | null;

/** Claim + send one reminder. The Cloud Task (or manual sweep) calls this per taskId. */
export async function fireReminderForTask(owner: string, taskId: string): Promise<FireResult> {
  const decision = await adminDb().runTransaction(async (tx): Promise<FireResult> => {
    const ref = rref(taskId);
    const rs = await tx.get(ref);
    if (!rs.exists) return null;
    const r = rs.data() as ReminderDoc;
    if (!ownsRecord(owner, r)) return null;
    if (!r.active || (r.status !== "pending" && r.status !== "sent")) return null;
    if (new Date(r.fireAt).getTime() > Date.now()) return { status: "not_due", fireAt: r.fireAt };

    const ts = await tx.get(coll("tasks").doc(taskId));
    if (!ts.exists) {
      tx.set(ref, { status: "cancelled", active: false, updatedAt: nowUtcIso() }, { merge: true });
      return null;
    }
    const t = ts.data() as { ownerId: string; remindersEnabled?: boolean; status: Status; deletedAt?: string | null; escalationPolicy?: keyof typeof ESCALATION_INTERVALS };
    if (!ownsRecord(owner, t)) return null;
    if (t.deletedAt || t.remindersEnabled === false) {
      tx.set(ref, { status: "cancelled", active: false, updatedAt: nowUtcIso() }, { merge: true });
      return null;
    }
    if (t.status === "done") {
      tx.set(ref, { status: "acknowledged", active: false, updatedAt: nowUtcIso() }, { merge: true });
      return null;
    }
    if (t.status === "in_progress") {
      tx.set(ref, { status: "paused", active: false, updatedAt: nowUtcIso() }, { merge: true });
      return null;
    }

    const interval = ESCALATION_INTERVALS[t.escalationPolicy ?? "default"];
    let rung = r.currentRung ?? 0;
    let repeat = r.repeatCount ?? 0;
    const sendRung = rung;
    let nextMs: number;

    if (rung === 0) {
      repeat += 1;
      if (repeat >= RUNG0_MAX_REPEATS) { rung = 1; repeat = 0; nextMs = Date.now() + interval * 60_000; }
      else nextMs = Date.now() + RUNG0_REPEAT_MINUTES * 60_000;
    } else {
      repeat += 1;
      if (repeat >= RUNG1_SAFETY_CAP) {
        tx.set(ref, { status: "sent", active: false, currentRung: 1, repeatCount: repeat, lastSentAt: nowUtcIso(), updatedAt: nowUtcIso() }, { merge: true });
        return { status: "fired", rung: 1, nextFireAt: null, active: false };
      }
      nextMs = Date.now() + interval * 60_000;
    }

    const nextFireAt = new Date(nextMs).toISOString();
    tx.set(ref, { currentRung: rung, repeatCount: repeat, status: "sent", active: true, fireAt: nextFireAt, lastSentAt: nowUtcIso(), updatedAt: nowUtcIso() }, { merge: true });
    return { status: "fired", rung: sendRung, nextFireAt, active: true };
  });

  if (decision?.status === "fired") {
    const task = await getTask(owner, taskId);
    if (task) {
      const token = await signActionToken(owner, taskId);
      await sendPushToUser(owner, reminderPayload(task, decision.rung, token));
      await audit("reminder_fire", { taskId, rung: decision.rung });
    }
  }
  return decision;
}

/** Fire + (re)schedule the next Cloud Task for one reminder. Called by /api/fire. */
export async function fireAndChain(owner: string, taskId: string): Promise<{ rung?: number; rescheduled: boolean }> {
  const res = await fireReminderForTask(owner, taskId);
  if (!res) return { rescheduled: false };
  if (res.status === "not_due") {
    await scheduleFire(owner, taskId, res.fireAt);
    return { rescheduled: true };
  }
  if (res.active && res.nextFireAt) {
    await scheduleFire(owner, taskId, res.nextFireAt);
    return { rung: res.rung, rescheduled: true };
  }
  return { rung: res.rung, rescheduled: false };
}

/** Manual reconcile (owner-triggered, NO cron): fire anything due, re-enqueue anything drifted. */
export async function sweep(owner: string): Promise<{ fired: number; rescheduled: number }> {
  const snap = await coll("reminders").where("ownerId", "==", owner).where("active", "==", true).get();
  const now = Date.now();
  let fired = 0;
  let rescheduled = 0;
  for (const d of snap.docs) {
    const r = d.data() as ReminderDoc;
    if (new Date(r.fireAt).getTime() <= now) {
      const res = await fireAndChain(owner, d.id);
      if (res.rung !== undefined) fired++;
      if (res.rescheduled) rescheduled++;
    } else if (!r.cloudTaskName) {
      await scheduleFire(owner, d.id, r.fireAt);
      rescheduled++;
    }
  }
  return { fired, rescheduled };
}
