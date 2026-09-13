import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Identity } from "./auth";
import { adminDb, coll, reserveWorkspaceWrite } from "./store";
import { encField, decField } from "./crypto";
import type { SharedAction, SharedList, SharedMember, SharedSummary, SharedTask } from "./shared-types";

type Group = { name: string; ownerUid: string; version: number; members: SharedMember[]; tasks: SharedTask[]; invitations: { id: string; email: string; expiresAt: number }[] };
export class SharedError extends Error { constructor(message: string, public status = 404) { super(message); } }
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
const index = (uid: string) => coll("shared_memberships").doc(hash(uid));
const groups = () => coll("shared_lists");
const key = (id: string) => `shared-list:${id}`;
function member(group: Group | undefined, user: Identity): asserts group is Group {
  if (!group || !group.members.some(m => m.uid === user.uid)) throw new SharedError("List unavailable or access removed");
}
function owner(group: Group, user: Identity) {
  if (group.ownerUid !== user.uid) throw new SharedError("Only the list owner can do that", 403);
}
function decoded(id: string, g: Group, user: Identity): SharedList {
  member(g, user);
  return { ...g, id, name: decField(g.name, key(id))!,
    tasks: g.tasks.map(t => ({ ...t, title: decField(t.title, key(id))!, notes: decField(t.notes, key(id)) ?? "" })),
    invitations: g.ownerUid === user.uid ? g.invitations.filter(i => i.expiresAt > Date.now()) : [] };
}
export async function sharedLists(user: Identity): Promise<SharedSummary[]> {
  const ids: string[] = (await index(user.uid).get()).data()?.ids ?? [];
  if (!ids.length) return [];
  const docs = await adminDb().getAll(...ids.slice(0, 20).map(id => groups().doc(id)));
  return docs.flatMap(doc => {
    const g = doc.data() as Group | undefined;
    if (!g?.members.some(m => m.uid === user.uid)) return [];
    return [{ id: doc.id, name: decField(g.name, key(doc.id))!, ownerUid: g.ownerUid, version: g.version, memberCount: g.members.length, open: g.tasks.filter(t => t.status !== "done").length }];
  });
}
export async function sharedList(user: Identity, id: string, version?: number) {
  const g = (await groups().doc(id).get()).data() as Group | undefined;
  member(g, user);
  return g.version === version ? { unchanged: true } : { list: decoded(id, g, user) };
}
export async function mutateShared(user: Identity, action: SharedAction): Promise<{ id: string; token?: string }> {
  // Charge the authenticated person's existing global/user budget, never an attacker-chosen list.
  await reserveWorkspaceWrite(user.owner);
  const id = action.action === "create" ? randomUUID() : action.action === "accept" ? action.token.split(".")[0] : action.id;
  const ref = groups().doc(id);
  const secret = action.action === "invite" ? randomBytes(32).toString("base64url") : undefined;
  const taskId = randomUUID();
  return adminDb().runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    let g = snapshot.data() as Group | undefined;
    if (action.action === "create" || action.action === "accept") {
      const membership = await tx.get(index(user.uid));
      const ids: string[] = membership.data()?.ids ?? [];
      if (action.action === "create") {
        if (g) throw new SharedError("Please try again", 409);
        g = { name: encField(action.name, key(id))!, ownerUid: user.uid, version: 0, members: [{ uid: user.uid, email: user.email }], tasks: [], invitations: [] };
      } else {
        const invite = g?.invitations.find(i => i.id === hash(action.token.split(".")[1]) && i.expiresAt > Date.now() && i.email === user.email.toLowerCase());
        if (!g || !invite) throw new SharedError("Invitation unavailable, expired, or intended for another Google account", 404);
        if (!g.members.some(m => m.uid === user.uid)) {
          if (g.members.length >= 20) throw new SharedError("This list has reached 20 members", 429);
          g.members.push({ uid: user.uid, email: user.email });
        }
        g.invitations = g.invitations.filter(i => i.id !== invite.id);
      }
      if (!ids.includes(id)) {
        if (ids.length >= 20) throw new SharedError("You can belong to up to 20 shared lists", 429);
        tx.set(index(user.uid), { ids: [...ids, id] });
      }
    } else {
      member(g, user);
      if (["rename", "delete", "invite", "revoke", "removeMember"].includes(action.action)) owner(g, user);
      if (action.action === "delete") {
        const memberships = await tx.getAll(...g.members.map(m => index(m.uid)));
        for (const doc of memberships) tx.set(doc.ref, { ids: ((doc.data()?.ids ?? []) as string[]).filter(i => i !== id) });
        tx.delete(ref); return { id };
      }
      if (action.action === "leave" || action.action === "removeMember") {
        const uid = action.action === "leave" ? user.uid : action.uid;
        if (uid === g.ownerUid) throw new SharedError("The owner must keep ownership or delete the list", 400);
        if (!g.members.some(m => m.uid === uid)) throw new SharedError("Member no longer belongs to this list");
        const membership = await tx.get(index(uid));
        tx.set(index(uid), { ids: ((membership.data()?.ids ?? []) as string[]).filter(i => i !== id) });
        g.members = g.members.filter(m => m.uid !== uid);
        g.tasks = g.tasks.map(t => t.assignee === uid ? { ...t, assignee: null, revision: t.revision + 1 } : t);
      }
      if (action.action === "rename") g.name = encField(action.name, key(id))!;
      if (action.action === "invite") {
        if (g.members.some(m => m.email.toLowerCase() === action.email)) throw new SharedError("This person is already a member", 400);
        g.invitations = g.invitations.filter(i => i.expiresAt > Date.now() && i.email !== action.email);
        if (g.invitations.length >= 20) throw new SharedError("Up to 20 pending invitations per list", 429);
        g.invitations.push({ id: hash(secret!), email: action.email, expiresAt: Date.now() + 7 * 86400_000 });
      }
      if (action.action === "revoke") g.invitations = g.invitations.filter(i => i.id !== action.inviteId);
      if (action.action === "addTask" || action.action === "editTask") {
        const fields = action.action === "addTask" ? action.task : action.patch;
        if (fields.assignee && !g.members.some(m => m.uid === fields.assignee)) throw new SharedError("Choose a current list member", 400);
        const encrypted = { ...fields,
          ...(fields.title !== undefined ? { title: encField(fields.title, key(id))! } : {}),
          ...(fields.notes !== undefined ? { notes: encField(fields.notes, key(id)) ?? "" } : {}) };
        const modified = { updatedAt: new Date().toISOString(), updatedBy: user.uid };
        if (action.action === "addTask") {
          if (g.tasks.length >= 200) throw new SharedError("This list has reached 200 tasks; remove completed tasks to make room", 429);
          g.tasks.push({ ...action.task, ...encrypted, ...modified, id: taskId, revision: 1 });
        } else {
          const t = g.tasks.find(t => t.id === action.taskId);
          if (!t) throw new SharedError("Task no longer exists");
          if (t.revision !== action.revision) throw new SharedError("Someone changed this task. Refresh and try again.", 409);
          Object.assign(t, encrypted, modified, { revision: t.revision + 1 });
        }
      }
      if (action.action === "deleteTask") {
        const t = g.tasks.find(t => t.id === action.taskId);
        if (!t) throw new SharedError("Task no longer exists");
        if (t.revision !== action.revision) throw new SharedError("Someone changed this task. Refresh and try again.", 409);
        g.tasks = g.tasks.filter(t => t.id !== action.taskId);
      }
    }
    g.version++;
    // Bound encrypted UTF-8 size below Firestore's 1 MiB document ceiling.
    if (Buffer.byteLength(JSON.stringify(g)) > 800_000) throw new SharedError("This list is full; remove some completed tasks", 429);
    tx.set(ref, g);
    return { id, ...(secret ? { token: `${id}.${secret}` } : {}) };
  });
}
