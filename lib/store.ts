import "server-only";
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";
import { env } from "./config";
import { encField, decField } from "./crypto";
import { nowUtcIso, nowIstParts } from "./time";
import { Task, type PushSub } from "./types";

/**
 * Firestore data layer (Admin SDK, ADC — no key file on Cloud Run).
 * Data lives in the shared `(default)` DB under `momentum_*` collections; sensitive
 * text fields are AES-256-GCM encrypted (B6). All access is server-side and owner-scoped.
 */

function adminApp(): App {
  return (
    getApps()[0] ??
    initializeApp({ projectId: env().gcpProject, credential: applicationDefault() })
  );
}

let _db: Firestore | null = null;
export function adminDb(): Firestore {
  if (_db) return _db;
  const app = adminApp();
  const dbId = env().firestoreDb;
  _db = dbId && dbId !== "(default)" ? getFirestore(app, dbId) : getFirestore(app);
  try {
    _db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() can only run once per Firestore instance; safe to ignore on re-entry.
  }
  return _db;
}

const NS = "momentum_";
export const coll = (name: string) => adminDb().collection(NS + name);
export { FieldValue };

function istDateKey(): string {
  const p = nowIstParts();
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

// ─────────────────────────── board version (cheap polling, §
//  ₹0: clients poll this 1-doc version, not the whole board) ──────────────────
export async function bumpVersion(owner: string): Promise<void> {
  await coll("meta").doc("version").set(
    { v: FieldValue.increment(1), at: nowUtcIso(), owner },
    { merge: true },
  );
}
export async function getVersion(): Promise<number> {
  const s = await coll("meta").doc("version").get();
  return s.exists ? (s.data()!.v ?? 0) : 0;
}

// ─────────────────────────── tasks ───────────────────────────
type Doc = DocumentData;

function toDoc(t: Task): Doc {
  return {
    ownerId: t.ownerId,
    title: encField(t.title),
    description: encField(t.description ?? ""),
    status: t.status,
    priority: t.priority,
    isBlocked: t.isBlocked,
    blockedReason: encField(t.blockedReason),
    dueAt: t.dueAt ?? null,
    effortMins: t.effortMins ?? null,
    cognitiveLoad: t.cognitiveLoad ?? null,
    projectId: t.projectId ?? null,
    tags: t.tags ?? [],
    dependsOn: t.dependsOn ?? [],
    blocks: t.blocks ?? [],
    subtasks: (t.subtasks ?? []).map((s) => ({ ...s, title: encField(s.title) })),
    recurrence: t.recurrence ?? null,
    escalationPolicy: t.escalationPolicy,
    rankScore: t.rankScore ?? 0,
    rankReason: t.rankReason ?? "",
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    completedAt: t.completedAt ?? null,
    archivedAt: t.archivedAt ?? null,
    deletedAt: t.deletedAt ?? null, // explicit null so equality query works
  };
}

function fromDoc(id: string, d: Doc): Task {
  return {
    id,
    ownerId: d.ownerId,
    title: decField(d.title) ?? "",
    description: decField(d.description) ?? "",
    status: d.status ?? "todo",
    priority: d.priority ?? "med",
    isBlocked: !!d.isBlocked,
    blockedReason: decField(d.blockedReason) ?? undefined,
    dueAt: d.dueAt ?? undefined,
    effortMins: d.effortMins ?? undefined,
    cognitiveLoad: d.cognitiveLoad ?? undefined,
    projectId: d.projectId ?? undefined,
    tags: d.tags ?? [],
    dependsOn: d.dependsOn ?? [],
    blocks: d.blocks ?? [],
    subtasks: (d.subtasks ?? []).map((s: { id: string; title: string; done?: boolean; effortMins?: number }) => ({ ...s, title: decField(s.title) ?? "" })),
    recurrence: d.recurrence ?? undefined,
    escalationPolicy: d.escalationPolicy ?? "default",
    rankScore: d.rankScore ?? 0,
    rankReason: d.rankReason ?? "",
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    completedAt: d.completedAt ?? undefined,
    archivedAt: d.archivedAt ?? undefined,
    deletedAt: d.deletedAt ?? undefined,
  } as Task;
}

/** All non-deleted tasks for the owner (board + search). Two equality filters → no composite index. */
export async function listActiveTasks(owner: string): Promise<Task[]> {
  const snap = await coll("tasks").where("ownerId", "==", owner).where("deletedAt", "==", null).get();
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}

export async function getTask(owner: string, id: string): Promise<Task | null> {
  const s = await coll("tasks").doc(id).get();
  if (!s.exists) return null;
  const t = fromDoc(s.id, s.data()!);
  return t.ownerId === owner ? t : null;
}

export async function createTask(owner: string, input: Partial<Task>): Promise<Task> {
  const id = crypto.randomUUID();
  const now = nowUtcIso();
  const task = Task.parse({
    ...input,
    id,
    ownerId: owner,
    createdAt: now,
    updatedAt: now,
  });
  await coll("tasks").doc(id).set(toDoc(task));
  await bumpVersion(owner);
  return task;
}

export async function updateTask(owner: string, id: string, patch: Partial<Task>): Promise<Task | null> {
  const existing = await getTask(owner, id);
  if (!existing) return null;
  const merged: Task = { ...existing, ...patch, id, ownerId: owner, updatedAt: nowUtcIso() };
  // Allow clearing the deadline: an empty string / null from the editor means "no dueAt".
  if (merged.dueAt === "" || merged.dueAt === null) merged.dueAt = undefined;
  if ((merged.recurrence as unknown) === null) merged.recurrence = undefined;
  // status side-effects
  if (patch.status === "done" && existing.status !== "done") merged.completedAt = nowUtcIso();
  if (patch.status && patch.status !== "done") merged.completedAt = undefined;
  const task = Task.parse(merged);
  await coll("tasks").doc(id).set(toDoc(task));
  await bumpVersion(owner);
  return task;
}

export async function softDeleteTask(owner: string, id: string): Promise<boolean> {
  const t = await getTask(owner, id);
  if (!t) return false;
  await coll("tasks").doc(id).set({ deletedAt: nowUtcIso(), updatedAt: nowUtcIso() }, { merge: true });
  await bumpVersion(owner);
  return true;
}

/** Archive done tasks completed >24h ago (§16.4; run by the sweep). Equality-only query. */
export async function archiveOldDone(owner: string): Promise<number> {
  const snap = await coll("tasks").where("ownerId", "==", owner).where("status", "==", "done").get();
  const cutoff = Date.now() - 24 * 3_600_000;
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.archivedAt || data.deletedAt || !data.completedAt) continue;
    if (new Date(data.completedAt).getTime() <= cutoff) {
      await d.ref.set({ archivedAt: nowUtcIso(), updatedAt: nowUtcIso() }, { merge: true });
      n++;
    }
  }
  if (n) await bumpVersion(owner);
  return n;
}

// ─────────────────────────── gemini daily cap (atomic, B1/B2 defense) ───────────────────────────
export async function reserveGeminiCall(cap: number): Promise<{ allowed: boolean; used: number }> {
  const ref = coll("meta").doc("gemini");
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const today = istDateKey();
    const d = snap.exists ? snap.data()! : {};
    const used = d.date === today ? (d.count ?? 0) : 0;
    if (used >= cap) return { allowed: false, used };
    tx.set(ref, { date: today, count: used + 1, updatedAt: nowUtcIso() }, { merge: true });
    return { allowed: true, used: used + 1 };
  });
}
export async function geminiUsage(): Promise<{ used: number; date: string; cap: number }> {
  const s = await coll("meta").doc("gemini").get();
  const d = s.exists ? s.data()! : {};
  const today = istDateKey();
  return { used: d.date === today ? (d.count ?? 0) : 0, date: today, cap: env().geminiDailyCap };
}

// ─────────────────────────── login lockout (durable; B4/B5 — only crossings persisted) ───────────────────────────
export async function getLoginLock(): Promise<{ lockedUntil: number; fails: number }> {
  const s = await coll("meta").doc("login").get();
  const d = s.exists ? s.data()! : {};
  return { lockedUntil: d.lockedUntil ?? 0, fails: d.fails ?? 0 };
}
export async function recordLoginFail(): Promise<number> {
  const ref = coll("meta").doc("login");
  return adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.exists ? s.data()! : {};
    const fails = (d.fails ?? 0) + 1;
    let lockedUntil = 0;
    if (fails >= 3) lockedUntil = Date.now() + Math.min(3600, 2 ** (fails - 3)) * 1000;
    tx.set(ref, { fails, lockedUntil, updatedAt: nowUtcIso() }, { merge: true });
    return lockedUntil;
  });
}
export async function clearLoginFails(): Promise<void> {
  await coll("meta").doc("login").set({ fails: 0, lockedUntil: 0 }, { merge: true });
}

// ─────────────────────────── session revocation (H2) ───────────────────────────
export async function getMinIat(): Promise<number> {
  const s = await coll("meta").doc("session").get();
  return s.exists ? (s.data()!.minIat ?? 0) : 0;
}
export async function bumpMinIat(): Promise<void> {
  await coll("meta").doc("session").set({ minIat: Math.floor(Date.now() / 1000) }, { merge: true });
}

// ─────────────────────────── push subscriptions ───────────────────────────
export async function listPushSubs(): Promise<PushSub[]> {
  const s = await coll("meta").doc("pushSubs").get();
  return s.exists ? (s.data()!.subs ?? []) : [];
}
export async function addPushSub(sub: PushSub): Promise<void> {
  const ref = coll("meta").doc("pushSubs");
  await adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const subs: PushSub[] = s.exists ? (s.data()!.subs ?? []) : [];
    const next = subs.filter((x) => x.endpoint !== sub.endpoint);
    next.push(sub);
    tx.set(ref, { subs: next }, { merge: true });
  });
}
export async function removePushSub(endpoint: string): Promise<void> {
  const ref = coll("meta").doc("pushSubs");
  await adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const subs: PushSub[] = s.exists ? (s.data()!.subs ?? []) : [];
    tx.set(ref, { subs: subs.filter((x) => x.endpoint !== endpoint) }, { merge: true });
  });
}

// ─────────────────────────── audit (append-only; never log PII) ───────────────────────────
export async function audit(kind: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await coll("audit").add({ at: nowUtcIso(), kind, detail });
  } catch {
    /* audit must never break the request path */
  }
}
