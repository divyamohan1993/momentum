"use client";
import { useRef, useState } from "react";
import { api, type BoardData } from "@/lib/client";
import type { Project } from "@/lib/types";

export default function WorkspacePanel({ data, onClose, onChange }: { data: BoardData; onClose: () => void; onChange: () => void }) {
  const [timeZone, setTimeZone] = useState(data.profile.timeZone);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<Project[]>(data.profile.projects);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  async function save() {
    setBusy(true); setMessage("");
    try { await api.updateProfile({ timeZone, projects }); onChange(); setMessage("Workspace saved."); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  async function importFile(f?: File) {
    if (!f) return;
    if (f.size > 1_000_000) { setMessage("Use a JSON backup under 1 MB."); return; }
    setBusy(true); setMessage("");
    try { const r = await api.importTasks(JSON.parse(await f.text())); setProjects((await api.profile()).profile.projects); onChange(); setMessage(`Imported ${r.count} task copies. Reminders start disabled so you can review their dates.`); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="workspace-title" className="glass max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><h2 id="workspace-title" className="text-xl font-semibold">Your workspace</h2><p className="mt-1 break-all text-sm text-[var(--color-mute)]">{data.profile.email}</p></div><button onClick={onClose} aria-label="Close workspace settings" className="focus-ring rounded-lg p-2">✕</button></div>
      <div className="mt-5 rounded-xl bg-[var(--color-signal)]/10 p-4"><p className="font-medium">Free, with room to focus</p><p className="mt-1 text-sm text-[var(--color-mute)]">Projects, recurring tasks, reminders, subtasks and exports are included. AI: {Math.max(0, data.usage.cap - data.usage.used)} of {data.usage.cap} daily requests left.</p><p className="mt-2 text-xs text-[var(--color-faint)]">AI is shared and may temporarily be unavailable. Your board still works manually. Up to 5,000 stored tasks and 1,000 task changes per day.</p></div>
      <label className="mt-5 block text-sm font-medium" htmlFor="workspace-zone">Timezone</label>
      <input id="workspace-zone" list="workspace-zones" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-haze)] px-3 py-2.5" />
      <datalist id="workspace-zones">{["UTC", "Asia/Kolkata", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"].map((zone) => <option key={zone} value={zone} />)}</datalist>
      <h3 className="mt-5 font-medium">Projects</h3>
      <div className="mt-2 flex flex-wrap gap-2">{projects.map((p) => <span key={p.id} className="rounded-lg border border-[var(--color-edge)] px-3 py-1.5 text-sm">{p.name}</span>)}</div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && projects.length < 50) { setProjects([...projects, { id: crypto.randomUUID(), name: name.trim(), color: "sky" }]); setName(""); } }}><input aria-label="New project name" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="Work, personal, learning…" className="focus-ring min-w-0 flex-1 rounded-xl border border-[var(--color-edge)] bg-[var(--color-haze)] px-3 py-2.5" /><button disabled={!name.trim() || projects.length >= 50} className="focus-ring hairline rounded-xl px-4 disabled:opacity-40">Add</button></form>
      <button onClick={save} disabled={busy} className="focus-ring btn-primary mt-4 w-full rounded-xl px-4 py-2.5 font-medium disabled:opacity-50">Save workspace</button>
      {data.notificationsEnabled && <button onClick={async () => { await api.disablePush(); onChange(); setMessage("Notifications disabled for this workspace on this device."); }} className="focus-ring hairline mt-4 w-full rounded-xl px-4 py-2.5 text-sm">Disable notifications on this device</button>}
      <h3 className="mt-6 font-medium">Your data, portable</h3><p className="mt-1 text-sm text-[var(--color-mute)]">Download a backup, open your tasks in a spreadsheet, or add deadlines to your calendar.</p>
      <div className="mt-3 flex flex-wrap gap-2">{[["json", "JSON backup"], ["csv", "Spreadsheet CSV"], ["ics", "Calendar file"]].map(([format, label]) => <a key={format} href={`/api/workspace/export?format=${format}`} className="focus-ring hairline rounded-lg px-3 py-2 text-sm">{label}</a>)}</div>
      <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Import Momentum JSON backup" onChange={(e) => importFile(e.target.files?.[0])} />
      <button onClick={() => file.current?.click()} disabled={busy} className="focus-ring hairline mt-3 rounded-lg px-3 py-2 text-sm disabled:opacity-40">Import JSON backup</button><p className="mt-2 text-xs text-[var(--color-faint)]">Imports create new copies, up to 200 tasks at a time. Existing tasks are not overwritten.</p>
      {message && <p role="status" className="mt-4 text-sm text-[var(--color-ink)]">{message}</p>}
    </section>
  </div>;
}
