import "server-only";
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";
import { env, brainEnabled } from "./config";
import { encField, decField } from "./crypto";
import { nowUtcIso, nowIstParts } from "./time";
import { Task, Project, type WorkspaceProfile, type PushSub } from "./types";
import { workspaceKey, validTimeZone, ownsRecord } from "./workspace-policy";

export function adminApp(): App {
  if (process.env.NODE_ENV === "production" && (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST)) throw new Error("Emulators are disabled in production");
  return getApps()[0] ?? initializeApp({ projectId: env().gcpProject, credential: applicationDefault() });
}
let db: Firestore | null = null;
export function adminDb(): Firestore {
  if (!db) {
    db = env().firestoreDb === "(default)" ? getFirestore(adminApp()) : getFirestore(adminApp(), env().firestoreDb);
    try { db.settings({ ignoreUndefinedProperties: true }); }
    catch (error) {
      // The Admin SDK shares its client across Next route bundles and development reloads.
      if (!(error instanceof Error) || !/already.*initialized|settings\(\).*once/i.test(error.message)) throw error;
    }
  }
  return db;
}
export const coll = (name: string) => adminDb().collection("momentum_" + name);
export const workspaceMeta = (owner: string, name: string) => coll("workspaces").doc(workspaceKey(owner)).collection("meta").doc(name);
export { FieldValue };
function dateKey() {
  const p = nowIstParts();
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
export async function bumpVersion(owner: string): Promise<void> {
  await workspaceMeta(owner, "version").set({ v: FieldValue.increment(1), at: nowUtcIso() }, { merge: true });
}
export async function getVersion(owner: string): Promise<number> { return (await workspaceMeta(owner, "version").get()).data()?.v ?? 0; }

function toDoc(task: Task): DocumentData {
  const { id: _, ...data } = task;
  return { ...data, title: encField(task.title, task.ownerId), description: encField(task.description, task.ownerId),
    blockedReason: encField(task.blockedReason, task.ownerId), tags: task.tags.map((tag) => encField(tag, task.ownerId)),
    subtasks: task.subtasks.map((s) => ({ ...s, title: encField(s.title, task.ownerId) })),
    deletedAt: task.deletedAt ?? null, dueAt: task.dueAt ?? null, recurrence: task.recurrence ?? null };
}
function fromDoc(owner: string, id: string, data: DocumentData): Task {
  if (!ownsRecord(owner, data)) throw new Error("Task owner mismatch");
  const optional = Object.fromEntries(["blockedReason", "dueAt", "effortMins", "cognitiveLoad", "projectId", "recurrence", "completedAt", "archivedAt", "deletedAt"].map((key) => [key, data[key] ?? undefined]));
  return Task.parse({ ...data, ...optional, id, title: decField(data.title, owner) ?? "", description: decField(data.description, owner) ?? "",
    blockedReason: decField(data.blockedReason, owner), tags: (data.tags ?? []).map((tag: string) => decField(tag, owner) ?? ""),
    subtasks: (data.subtasks ?? []).map((s: { title: string }) => ({ ...s, title: decField(s.title, owner) ?? "" })),
    remindersEnabled: data.remindersEnabled !== false });
}
export async function listActiveTasks(owner: string): Promise<Task[]> {
  const snap = await coll("tasks").where("ownerId", "==", owner).where("deletedAt", "==", null).limit(5000).get();
  return snap.docs.map((d) => fromDoc(owner, d.id, d.data()));
}
export async function getTask(owner: string, id: string): Promise<Task | null> {
  const s = await coll("tasks").doc(id).get();
  return s.exists && ownsRecord(owner, s.data()) ? fromDoc(owner, s.id, s.data()!) : null;
}
function taskIdFor(owner: string, key?: string): string {
  if (!key) return crypto.randomUUID();
  const h = workspaceKey(owner + ":" + key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export async function createTask(owner: string, input: Partial<Task>, idempotencyKey?: string): Promise<Task> {
  const id = taskIdFor(owner, idempotencyKey), now = nowUtcIso();
  const task = Task.parse({ ...input, id, ownerId: owner, createdAt: now, updatedAt: now });
  await reserveWorkspaceWrite(owner);
  return adminDb().runTransaction(async (tx) => {
    const ref = coll("tasks").doc(id), capacity = workspaceMeta(owner, "capacity");
    const [existing, count] = await Promise.all([tx.get(ref), tx.get(capacity)]);
    if (existing.exists) return fromDoc(owner, existing.id, existing.data()!);
    const used = count.data()?.count ?? 0;
    if (!Number.isSafeInteger(used) || used < 0 || used >= 5000) throw new WorkspaceLimit();
    tx.create(ref, toDoc(task)); tx.set(capacity, { count: used + 1 });
    tx.set(workspaceMeta(owner, "version"), { v: FieldValue.increment(1), at: now }, { merge: true });
    return task;
  });
}
export async function createTasksBatch(owner: string, inputs: Partial<Task>[], importedProjects: Project[] = []): Promise<Task[]> {
  if (!inputs.length || inputs.length > 200) throw new WorkspaceLimit();
  const now = nowUtcIso();
  const tasks = inputs.map((input) => Task.parse({ ...input, id: crypto.randomUUID(), ownerId: owner, createdAt: now, updatedAt: now }));
  await reserveWorkspaceWrite(owner, tasks.length);
  await adminDb().runTransaction(async (tx) => {
    const capacity = workspaceMeta(owner, "capacity"), profile = workspaceMeta(owner, "profile");
    const [cs, ps] = await Promise.all([tx.get(capacity), tx.get(profile)]);
    const used = cs.data()?.count ?? 0;
    if (!Number.isSafeInteger(used) || used < 0 || used + tasks.length > 5000) throw new WorkspaceLimit();
    const projects: Project[] = (ps.data()?.projects ?? []).map((p: Project) => ({ ...p, name: decField(p.name, owner) ?? "" }));
    const mapping = new Map<string, string>();
    for (const p of importedProjects) {
      const existing = projects.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      const target = existing ?? { ...Project.parse(p), id: crypto.randomUUID() };
      if (!existing) projects.push(target);
      mapping.set(p.id, target.id);
    }
    if (projects.length > 50) throw new WorkspaceLimit();
    const ownProjects = new Set(projects.map((p) => p.id));
    tasks.forEach((task, i) => {
      const source = inputs[i]?.projectId;
      task.projectId = source ? mapping.get(source) ?? (ownProjects.has(source) ? source : undefined) : undefined;
      tx.create(coll("tasks").doc(task.id), toDoc(task));
    });
    if (importedProjects.length) tx.update(profile, { projects: projects.map((p) => ({ ...p, name: encField(p.name, owner) })) });
    tx.set(capacity, { count: used + tasks.length });
    tx.set(workspaceMeta(owner, "version"), { v: FieldValue.increment(1), at: now }, { merge: true });
  });
  return tasks;
}
export async function updateTask(owner: string, id: string, patch: Partial<Task>): Promise<Task | null> {
  if (!(await getTask(owner, id))) return null;
  await reserveWorkspaceWrite(owner);
  return adminDb().runTransaction(async (tx) => {
    const ref = coll("tasks").doc(id), snap = await tx.get(ref);
    if (!snap.exists || !ownsRecord(owner, snap.data())) return null;
    const previous = fromDoc(owner, id, snap.data()!);
    const merged = { ...previous, ...patch, id, ownerId: owner, createdAt: previous.createdAt, updatedAt: nowUtcIso() };
    if (!merged.dueAt) merged.dueAt = undefined;
    else merged.dueAt = new Date(merged.dueAt).toISOString();
    if (merged.recurrence === null) merged.recurrence = undefined;
    if (patch.status === "done" && previous.status !== "done") merged.completedAt = nowUtcIso();
    if (patch.status && patch.status !== "done") { merged.completedAt = undefined; merged.archivedAt = undefined; }
    const task = Task.parse(merged);
    tx.set(ref, toDoc(task));
    tx.set(workspaceMeta(owner, "version"), { v: FieldValue.increment(1), at: nowUtcIso() }, { merge: true });
    return task;
  });
}
export async function deleteTaskRecord(owner: string, id: string): Promise<boolean> {
  if (!(await getTask(owner, id))) return false;
  await reserveWorkspaceWrite(owner);
  return adminDb().runTransaction(async (tx) => {
    const ref = coll("tasks").doc(id), capacity = workspaceMeta(owner, "capacity");
    const [task, count] = await Promise.all([tx.get(ref), tx.get(capacity)]);
    if (!task.exists || !ownsRecord(owner, task.data())) return false;
    tx.delete(ref);
    tx.set(capacity, { count: Math.max(0, (count.data()?.count ?? 1) - 1) });
    tx.set(workspaceMeta(owner, "version"), { v: FieldValue.increment(1), at: nowUtcIso() }, { merge: true });
    return true;
  });
}
export async function archiveOldDone(owner: string): Promise<number> {
  const snap = await coll("tasks").where("ownerId", "==", owner).where("status", "==", "done").limit(500).get();
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.archivedAt && !d.deletedAt && d.completedAt && Date.parse(d.completedAt) <= Date.now() - 86400000) {
      await doc.ref.set({ archivedAt: nowUtcIso(), updatedAt: nowUtcIso() }, { merge: true }); n++;
    }
  }
  if (n) await bumpVersion(owner); return n;
}
export class WorkspaceLimit extends Error { constructor() { super("The workspace or shared fair-use limit was reached. Please try later."); } }
export async function reserveWorkspaceWrite(owner: string, count = 1): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new WorkspaceLimit();
  await adminDb().runTransaction(async (tx) => {
    const ref = workspaceMeta(owner, "writes"), global = coll("meta").doc("workspaceWrites");
    const [ls, gs] = await Promise.all([tx.get(ref), tx.get(global)]);
    const d = ls.data() ?? {}, g = gs.data() ?? {}, date = dateKey(), minute = Math.floor(Date.now() / 60000);
    const used = d.date === date ? (d.count ?? 0) : 0, recent = d.minute === minute ? (d.minuteCount ?? 0) : 0, total = g.date === date ? (g.count ?? 0) : 0;
    if (![used, recent, total].every((n) => Number.isSafeInteger(n) && n >= 0) || used + count > 1000 || recent + count > 200 || total + count > 10000) throw new WorkspaceLimit();
    tx.set(ref, { date, count: used + count, minute, minuteCount: recent + count });
    tx.set(global, { date, count: total + count });
  });
}
export async function reserveGeminiCall(owner: string, cap: number): Promise<{ allowed: boolean; used: number }> {
  if (!owner || !Number.isSafeInteger(cap) || cap <= 0 || cap > 200) return { allowed: false, used: 0 };
  return adminDb().runTransaction(async (tx) => {
    const global = coll("meta").doc("gemini"), personal = workspaceMeta(owner, "gemini");
    const [gs, ps] = await Promise.all([tx.get(global), tx.get(personal)]);
    const g = gs.data() ?? {}, p = ps.data() ?? {}, date = dateKey(), minute = Math.floor(Date.now() / 60000);
    const gc = g.date === date ? (g.count ?? 0) : 0, pc = p.date === date ? (p.count ?? 0) : 0;
    const gm = g.minute === minute ? (g.minuteCount ?? 0) : 0, pm = p.minute === minute ? (p.minuteCount ?? 0) : 0;
    if (![gc, pc, gm, pm].every((n) => Number.isSafeInteger(n) && n >= 0) || gc >= cap || pc >= env().geminiUserDailyCap || gm >= 10 || pm >= 3) return { allowed: false, used: pc };
    tx.set(global, { date, count: gc + 1, minute, minuteCount: gm + 1, updatedAt: nowUtcIso() }, { merge: true });
    tx.set(personal, { date, count: pc + 1, minute, minuteCount: pm + 1 }, { merge: true });
    return { allowed: true, used: pc + 1 };
  });
}
export async function geminiUsage(owner: string) {
  const d = (await workspaceMeta(owner, "gemini").get()).data() ?? {}, date = dateKey();
  return { used: d.date === date ? (d.count ?? 0) : 0, date, cap: env().geminiUserDailyCap };
}
export type StoredPushSub = PushSub & { deviceHash: string };
export async function listPushSubs(owner: string): Promise<StoredPushSub[]> { return (await workspaceMeta(owner, "pushSubs").get()).data()?.subs ?? []; }
export async function addPushSub(owner: string, sub: PushSub, deviceHash: string): Promise<void> {
  await adminDb().runTransaction(async (tx) => {
    const ref = workspaceMeta(owner, "pushSubs"), subs: StoredPushSub[] = (await tx.get(ref)).data()?.subs ?? [];
    const next = subs.filter((s) => s.endpoint !== sub.endpoint && s.deviceHash !== deviceHash);
    if (next.length >= 5) throw new WorkspaceLimit();
    tx.set(ref, { subs: [...next, { ...sub, deviceHash }] });
  });
}
export async function removePushSub(owner: string, endpoint: string): Promise<void> {
  await adminDb().runTransaction(async (tx) => {
    const ref = workspaceMeta(owner, "pushSubs"), subs: StoredPushSub[] = (await tx.get(ref)).data()?.subs ?? [];
    tx.set(ref, { subs: subs.filter((s) => s.endpoint !== endpoint) });
  });
}
export async function removeDevicePushSubs(owner: string, deviceHash: string): Promise<void> {
  await adminDb().runTransaction(async (tx) => {
    const ref = workspaceMeta(owner, "pushSubs"), subs: StoredPushSub[] = (await tx.get(ref)).data()?.subs ?? [];
    tx.set(ref, { subs: subs.filter((s) => s.deviceHash !== deviceHash) });
  });
}
export async function setGoogleToken(owner: string, refreshToken: string): Promise<void> { await workspaceMeta(owner, "google").set({ refreshToken: encField(refreshToken, owner), connectedAt: nowUtcIso() }); }
export async function getGoogleToken(owner: string): Promise<string | null> { return decField((await workspaceMeta(owner, "google").get()).data()?.refreshToken, owner) ?? null; }
export async function clearGoogleToken(owner: string): Promise<void> { await workspaceMeta(owner, "google").set({ refreshToken: null, connectedAt: null }); }
export async function audit(kind: string, detail: Record<string, unknown> = {}): Promise<void> {
  try { await coll("audit").add({ at: nowUtcIso(), kind, detail }); } catch { /* Logging must not break a successful operation. */ }
}
export async function recordBrainStatus(owner: string, online: boolean, reason?: string): Promise<void> {
  try { await workspaceMeta(owner, "brain").set({ online, reason: reason ?? null, checkedAt: nowUtcIso() }); } catch { /* Status is observational. */ }
}
export async function brainOnline(owner: string): Promise<boolean> {
  return brainEnabled() && (await workspaceMeta(owner, "brain").get()).data()?.online !== false;
}
export async function ensureWorkspace(owner: string, identity: { uid: string; email: string; googleSub: string; displayName: string }, timeZone?: string): Promise<void> {
  await adminDb().runTransaction(async (tx) => {
    const ref = workspaceMeta(owner, "profile"), oldProfile = await tx.get(ref);
    if (oldProfile.exists) {
      const p = oldProfile.data()!;
      if (p.uid !== identity.uid || p.googleSub !== identity.googleSub) throw new Error("Workspace identity mismatch");
      return;
    }
    const legacy = owner === env().ownerEmail && identity.uid === env().ownerGoogleUid;
    const names = ["version", "pushSubs", "google", "brain"];
    const old = legacy ? await Promise.all(names.map((name) => tx.get(coll("meta").doc(name)))) : [];
    const oldTasks = legacy ? await tx.get(coll("tasks").where("ownerId", "==", owner)) : null;
    tx.set(ref, { ...identity, timeZone: legacy ? "Asia/Kolkata" : validTimeZone(timeZone) ? timeZone : "UTC", createdAt: nowUtcIso(), projects: [] });
    tx.set(workspaceMeta(owner, "capacity"), { count: oldTasks?.size ?? 0 });
    old.forEach((snap, i) => { if (snap.exists) tx.set(workspaceMeta(owner, names[i]!), snap.data()!); });
  });
}
export async function getWorkspaceProfile(owner: string): Promise<WorkspaceProfile> {
  const d = (await workspaceMeta(owner, "profile").get()).data();
  if (!d) throw new Error("Workspace unavailable");
  return { uid: d.uid, email: d.email, displayName: d.displayName, timeZone: d.timeZone, createdAt: d.createdAt, projects: (d.projects ?? []).map((p: Project) => ({ ...p, name: decField(p.name, owner) ?? "" })) };
}
export async function updateWorkspaceProfile(owner: string, patch: { timeZone?: string; projects?: Project[] }): Promise<void> {
  if (patch.timeZone !== undefined && !validTimeZone(patch.timeZone)) throw new Error("Invalid timezone");
  const data: Record<string, unknown> = {};
  if (patch.timeZone) data.timeZone = patch.timeZone;
  if (patch.projects) { if (patch.projects.length > 50) throw new WorkspaceLimit(); data.projects = patch.projects.map((p) => ({ ...Project.parse(p), name: encField(p.name, owner) })); }
  await reserveWorkspaceWrite(owner);
  await workspaceMeta(owner, "profile").update(data); await bumpVersion(owner);
}
