"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SharedList, SharedSummary, SharedTask, SharedAction } from "@/lib/shared-types";

const control = "focus-ring hairline rounded-xl px-3 py-2 text-sm";
const input = `${control} bg-[var(--color-panel)] w-full`;
async function request<T>(path = "", action?: SharedAction): Promise<T> {
  const res = await fetch(`/api/shared${path}`, { cache: "no-store", ...(action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : {}) });
  if (res.status === 401) { window.location.replace("/shared"); throw new Error("Sign in to continue"); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not update the list");
  return data;
}
export default function SharedLists({ uid, email }: { uid: string; email: string }) {
  const [lists, setLists] = useState<SharedSummary[]>([]);
  const [list, setList] = useState<SharedList | null>(null);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SharedTask | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const generation = useRef(0);
  const listRef = useRef(list);
  listRef.current = list;

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const [summary, detail] = await Promise.all([
        request<{ lists: SharedSummary[]; uid: string }>(),
        selected ? request<{ list?: SharedList; unchanged?: boolean }>(`?id=${selected}&version=${listRef.current?.id === selected ? listRef.current.version : 0}`) : Promise.resolve(null),
      ]);
      if (ticket !== generation.current) return;
      if (summary.uid !== uid) { document.documentElement.style.visibility = "hidden"; window.location.replace("/shared"); return; }
      setLists(summary.lists);
      if (detail?.list) setList(detail.list);
      if (!selected) setList(null);
    } catch (e) {
      if (ticket === generation.current) { setList(null); setEditing(null); setError((e as Error).message); }
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [selected, uid]);
  useEffect(() => {
    refresh();
    const tick = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => { generation.current++; clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("invite");
    if (token) { setInviteToken(token); window.history.replaceState({}, "", "/shared"); }
    const changed = (event: StorageEvent) => { if (event.key === "momentum-auth-change") { document.documentElement.style.visibility = "hidden"; window.location.replace("/shared"); } };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("storage", changed); window.addEventListener("pageshow", restored);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener("pageshow", restored); };
  }, []);
  async function mutate(action: SharedAction) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ id: string; token?: string }>("", action);
      if (action.action === "create" || action.action === "accept") { setSelected(result.id); setName(""); setInviteToken(""); }
      if (action.action === "delete" || action.action === "leave") { setSelected(""); setList(null); }
      if (result.token) { setInviteLink(`${window.location.origin}/shared#invite=${result.token}`); setInviteEmail(""); }
      if (action.action === "revoke" || action.action === "delete") setInviteLink("");
      setNotice(action.action === "invite" ? "Invitation ready. Send the link to the Google email you entered." : "Saved. Everyone in this list will see the update.");
      if (!["create", "accept", "delete", "leave"].includes(action.action)) await refresh();
      return true;
    } catch (e) { setError((e as Error).message); await refresh(); return false; }
    finally { setBusy(false); }
  }
  function choose(id: string) { generation.current++; setSelected(id); setList(null); setEditing(null); setInviteLink(""); setError(""); setNotice(""); setTitle(""); }
  const isOwner = list?.ownerUid === uid;
  const tasks = (list?.tasks ?? []).filter(t => (filter === "all" || (filter === "done" ? t.status === "done" : t.status !== "done")) && `${t.title} ${t.notes}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><a href="/" className="text-sm text-[var(--color-mute)]">← My private board</a><h1 className="text-grad mt-2 text-3xl font-bold">Shared lists</h1><p className="mt-2 text-sm text-[var(--color-mute)]">A little teamwork, a little more done. Free for couples, friends, and groups.</p></div>
      <span className="text-xs text-[var(--color-mute)]">Signed in as {email}</span>
    </header>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-400 p-3">{error}</p>}
    {notice && <p role="status" className="mb-4 text-sm text-[var(--color-go)]">{notice}</p>}
    {inviteToken && <section className="glass mb-6 rounded-2xl p-5"><h2 className="font-semibold">You’ve been invited</h2><p className="my-3 text-sm">Accept with {email}. Only the Google account named in the invitation can join. Your email will be visible to the list’s members.</p><button disabled={busy} className={control} onClick={() => mutate({ action: "accept", token: inviteToken })}>Accept invitation</button><button className={`${control} ml-2`} onClick={() => setInviteToken("")}>Dismiss</button></section>}
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <aside className="space-y-4">
        <form className="glass space-y-3 rounded-2xl p-4" onSubmit={e => { e.preventDefault(); mutate({ action: "create", name }); }}><label className="text-sm font-semibold" htmlFor="new-list">Create a shared list</label><input id="new-list" className={input} placeholder="Our home, Weekend plans…" maxLength={80} required value={name} onChange={e => setName(e.target.value)} /><button disabled={busy || !name.trim()} className={`${control} w-full`}>Create list</button></form>
        <nav aria-label="Your shared lists" className="space-y-2">{lists.map(l => <button key={l.id} aria-current={selected === l.id ? "page" : undefined} className={`${control} w-full text-left ${selected === l.id ? "bg-[var(--color-edge)]" : ""}`} onClick={() => choose(l.id)}><span className="block font-medium">{l.name}</span><span className="text-xs text-[var(--color-mute)]">{l.memberCount} members · {l.open} open tasks</span></button>)}</nav>
        <p className="text-xs leading-relaxed text-[var(--color-mute)]">Up to 20 members per list, 20 lists per person, and 200 tasks per list. Your personal tasks stay in your private board.</p>
      </aside>
      <section className="min-w-0">
        {!list ? <div className="glass rounded-2xl p-8"><h2 className="text-xl font-semibold">{loading ? "Loading your lists…" : "Make room for shared plans"}</h2><p className="mt-3 text-sm text-[var(--color-mute)]">Create a list or choose one to organize groceries, household jobs, trips, and anything you’re doing together.</p></div> : <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold break-words">{list.name}</h2><p className="text-xs text-[var(--color-mute)]">Only members can access this list · Updates every 15 seconds</p></div><button className={control} onClick={refresh}>Refresh</button></div>
          <form className="mb-4 flex gap-2" onSubmit={async e => { e.preventDefault(); if (await mutate({ action: "addTask", id: list.id, task: { title, notes: "", status: "todo", priority: "med", dueDate: null, assignee: null } })) setTitle(""); }}><input aria-label="New shared task" className={input} required maxLength={300} placeholder="What needs doing together?" value={title} onChange={e => setTitle(e.target.value)} /><button disabled={busy || !title.trim()} className={control}>Add task</button></form>
          <div className="mb-4 flex gap-2"><input aria-label="Search shared tasks" className={input} placeholder="Search tasks and notes" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Task status filter" className={control} value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open</option><option value="done">Completed</option><option value="all">All tasks</option></select></div>
          <ul className="space-y-3">{tasks.map(task => <li key={task.id} className="glass flex items-start gap-3 rounded-2xl p-4"><input aria-label={`Complete ${task.title}`} type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={task.status === "done"} disabled={busy} onChange={e => mutate({ action: "editTask", id: list.id, taskId: task.id, revision: task.revision, patch: { status: e.target.checked ? "done" : "todo" } })} /><button className="focus-ring min-w-0 flex-1 rounded text-left" onClick={() => setEditing(task)}><span className={`block break-words font-medium ${task.status === "done" ? "line-through opacity-60" : ""}`}>{task.title}</span>{task.notes && <span className="mt-1 block truncate text-sm text-[var(--color-mute)]">{task.notes}</span>}<span className="mt-2 block text-xs text-[var(--color-mute)]">{task.status === "doing" ? "In progress · " : ""}{task.priority === "high" ? "High priority · " : ""}{task.dueDate ? `Due ${task.dueDate} · ` : ""}{list.members.find(m => m.uid === task.assignee)?.email ?? "Unassigned"}</span></button></li>)}</ul>
          {!tasks.length && <p className="py-6 text-center text-sm text-[var(--color-mute)]">No tasks here yet.</p>}
          <details className="glass mt-8 rounded-2xl p-5"><summary className="cursor-pointer font-semibold">Members & invitations ({list.members.length})</summary><p className="my-3 text-xs text-[var(--color-mute)]">All members can add, edit, and delete shared tasks. Only the owner manages invitations and members. Members can see each other’s Google email.</p><ul className="space-y-2">{list.members.map(m => <li key={m.uid} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="break-all">{m.email}{m.uid === list.ownerUid ? " · Owner" : ""}{m.uid === uid ? " · You" : ""}</span>{isOwner && m.uid !== uid && <button disabled={busy} className={control} onClick={() => { if (confirm(`Remove ${m.email} from this list?`)) mutate({ action: "removeMember", id: list.id, uid: m.uid }); }}>Remove</button>}</li>)}</ul>
          {isOwner ? <div className="mt-5 space-y-4"><form className="space-y-2" onSubmit={e => { e.preventDefault(); setInviteLink(""); mutate({ action: "invite", id: list.id, email: inviteEmail }); }}><label htmlFor="invite-email" className="block text-sm">Invite someone by their Google email</label><div className="flex gap-2"><input id="invite-email" className={input} type="email" maxLength={254} required placeholder="partner@gmail.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /><button disabled={busy} className={control}>Create invite</button></div><p className="text-xs text-[var(--color-mute)]">Send them the link yourself. It expires in 7 days, works once, and requires their Google account. A new invite for the same email replaces the old one.</p></form>
          {inviteLink && <div className="space-y-2"><label htmlFor="invite-link" className="text-sm">Invitation link</label><input id="invite-link" className={input} value={inviteLink} readOnly onFocus={e => e.target.select()} /><button className={control} onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); setNotice("Invitation link copied."); } catch { setError("Select the invitation link and copy it manually."); } }}>Copy link</button></div>}
          {list.invitations.map(i => <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="break-all">Pending: {i.email} · expires {new Date(i.expiresAt).toLocaleDateString()}</span><button disabled={busy} className={control} onClick={() => mutate({ action: "revoke", id: list.id, inviteId: i.id })}>Revoke</button></div>)}
          <div className="flex gap-2 border-t border-[var(--color-edge)] pt-4"><button className={control} disabled={busy} onClick={() => { const value = prompt("List name", list.name); if (value?.trim()) mutate({ action: "rename", id: list.id, name: value }); }}>Rename list</button><button className={control} disabled={busy} onClick={() => { if (confirm("Permanently delete this shared list and all its tasks for everyone?")) mutate({ action: "delete", id: list.id }); }}>Delete list</button></div></div> : <button className={`${control} mt-5`} disabled={busy} onClick={() => { if (confirm("Leave this list? You will need a new invitation to rejoin.")) mutate({ action: "leave", id: list.id }); }}>Leave list</button>}
          </details>
        </>}
      </section>
    </div>
    {editing && list && <TaskEditor key={`${list.id}:${editing.id}`} task={editing} list={list} busy={busy} error={error} onClose={() => setEditing(null)} onSave={async task => { if (await mutate({ action: "editTask", id: list.id, taskId: editing.id, revision: editing.revision, patch: task })) setEditing(null); }} onDelete={async () => { if (confirm("Delete this shared task for everyone?") && await mutate({ action: "deleteTask", id: list.id, taskId: editing.id, revision: editing.revision })) setEditing(null); }} />}
  </main>;
}
function TaskEditor({ task, list, busy, error, onClose, onSave, onDelete }: { task: SharedTask; list: SharedList; busy: boolean; error: string; onClose: () => void; onSave: (task: Pick<SharedTask, "title" | "notes" | "status" | "priority" | "dueDate" | "assignee">) => Promise<void>; onDelete: () => void }) {
  const [draft, setDraft] = useState(task);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onClose={onClose} aria-label="Edit shared task" className="glass m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-[var(--color-panel)] p-6 text-[var(--color-ink)] backdrop:bg-black/60"><form className="space-y-4" onSubmit={e => { e.preventDefault(); const { title, notes, status, priority, dueDate, assignee } = draft; onSave({ title, notes, status, priority, dueDate, assignee }); }}>
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Edit shared task</h2><button type="button" className={control} onClick={onClose}>Close</button></div>
    {error && <p role="alert" className="text-sm text-[var(--color-warn)]">{error} Close this editor and reopen the task to load the latest version.</p>}
    <label className="block text-sm">Title<input className={`${input} mt-1`} autoFocus required maxLength={300} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
    <label className="block text-sm">Notes<textarea className={`${input} mt-1`} rows={3} maxLength={1500} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">Status<select className={`${input} mt-1`} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as SharedTask["status"] })}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select></label><label className="text-sm">Priority<select className={`${input} mt-1`} value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as SharedTask["priority"] })}><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option></select></label></div>
    <label className="block text-sm">Due date<input type="date" className={`${input} mt-1`} value={draft.dueDate ?? ""} onChange={e => setDraft({ ...draft, dueDate: e.target.value || null })} /></label>
    <label className="block text-sm">Assigned to<select className={`${input} mt-1`} value={draft.assignee ?? ""} onChange={e => setDraft({ ...draft, assignee: e.target.value || null })}><option value="">Anyone</option>{list.members.map(m => <option key={m.uid} value={m.uid}>{m.email}</option>)}</select></label>
    <p className="text-xs text-[var(--color-mute)]">Changes are visible to every member of this list.</p><div className="flex justify-between"><button type="button" disabled={busy} className={control} onClick={onDelete}>Delete task</button><button disabled={busy || !draft.title.trim()} className={control}>Save changes</button></div>
  </form></dialog>;
}
