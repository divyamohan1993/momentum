"use client";

import { useEffect, useState } from "react";
import type { Task, Subtask, Recurrence } from "@/lib/types";
import { api } from "@/lib/client";
import { formatIst, hoursUntil } from "@/lib/time";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
type Freq = "none" | "day" | "week" | "month";

/** Card detail + editor: countdown ring, editable title / deadline / priority, and actions. */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

const PRIOS: { v: Task["priority"]; label: string; color: string }[] = [
  { v: "low", label: "Low", color: "var(--color-violet)" },
  { v: "med", label: "Medium", color: "var(--color-amber)" },
  { v: "high", label: "High", color: "var(--color-signal)" },
];

export default function FocusMode({ task, onClose, onChange }: { task: Task; onClose: () => void; onChange: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(toLocalInput(task.dueAt));
  const [priority, setPriority] = useState<Task["priority"]>(task.priority);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks);
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(task.recurrence);
  const [busy, setBusy] = useState(false);
  const [decomposing, setDecomposing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [triageMsg, setTriageMsg] = useState<{ verdict: string; reason: string; subtasks?: string[] } | null>(null);
  const [triaging, setTriaging] = useState(false);
  const stale = (Date.now() - new Date(task.updatedAt).getTime()) / 86_400_000 >= 5 && (task.status === "todo" || task.status === "in_progress");
  async function runTriage() {
    if (triaging) return;
    setTriaging(true);
    const r = await api.triage(task.id).catch(() => null);
    setTriaging(false);
    if (r) setTriageMsg(r);
  }

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const dueIso = due ? fromLocalInput(due) : undefined;
  const h = dueIso ? hoursUntil(dueIso) : null;
  const frac = h === null ? 0 : Math.max(0, Math.min(1, 1 - h / 48));
  const overdue = h !== null && h <= 0;
  const ringColor = overdue ? "#f0606e" : frac > 0.6 ? "#ff9e43" : "#38bdf8";
  const C = 2 * Math.PI * 86;
  const dirty =
    title !== task.title ||
    due !== toLocalInput(task.dueAt) ||
    priority !== task.priority ||
    JSON.stringify(subtasks) !== JSON.stringify(task.subtasks) ||
    JSON.stringify(recurrence ?? null) !== JSON.stringify(task.recurrence ?? null);

  const fieldPatch = (): Partial<Task> => ({
    title: title.trim(),
    dueAt: (due ? fromLocalInput(due) : "") as string,
    priority,
    subtasks,
    recurrence: (recurrence ?? null) as Recurrence | undefined,
  });

  const freq: Freq = recurrence?.every ?? "none";
  function setFreq(f: Freq) {
    if (f === "none") setRecurrence(undefined);
    else setRecurrence({ every: f, interval: 1, daysOfWeek: f === "week" ? recurrence?.daysOfWeek ?? [] : undefined });
  }
  function toggleDow(d: number) {
    if (!recurrence || recurrence.every !== "week") return;
    const cur = recurrence.daysOfWeek ?? [];
    setRecurrence({ ...recurrence, daysOfWeek: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() });
  }
  async function breakDown() {
    if (decomposing) return;
    setDecomposing(true);
    const r = await api.decompose(task.id).catch(() => null);
    setDecomposing(false);
    if (r?.subtasks?.length)
      setSubtasks([...subtasks, ...r.subtasks.map((s) => ({ id: crypto.randomUUID(), title: s.title, done: false, effortMins: s.effortMins }))]);
  }
  function toggleSub(id: string) {
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  function removeSub(id: string) {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  }

  async function commit(extra: Partial<Task>) {
    if (busy || !title.trim()) return;
    setBusy(true);
    await api.patchTask(task.id, { ...(dirty ? fieldPatch() : {}), ...extra }).catch(() => {});
    setBusy(false);
    onChange();
    onClose();
  }
  async function del() {
    if (busy) return;
    setBusy(true);
    await api.deleteTask(task.id).catch(() => {});
    setBusy(false);
    onChange();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/65 p-4 backdrop-blur-md materialize"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit: ${task.title}`}
    >
      <div className="glass max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        {dueIso ? (
          <div className="relative mx-auto h-40 w-40">
            <svg viewBox="0 0 200 200" className="h-40 w-40 -rotate-90">
              <circle cx="100" cy="100" r="86" fill="none" stroke="var(--color-edge)" strokeWidth="10" />
              <circle
                cx="100"
                cy="100"
                r="86"
                fill="none"
                stroke={ringColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                style={{ transition: "stroke-dashoffset 0.6s, stroke 0.4s", filter: `drop-shadow(0 0 8px ${ringColor})` }}
              />
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <div className="text-2xl font-bold" style={{ color: ringColor }}>
                {countdown(dueIso, now)}
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-faint)]">{overdue ? "overdue" : "until due"}</div>
            </div>
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-[var(--color-faint)]">No deadline — set one below to get a reminder.</p>
        )}

        <label className="mt-5 block text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">Task</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="focus-ring mt-1 w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-haze)] px-3 py-2.5 text-[15px] font-medium text-[var(--color-ink)] outline-none"
        />

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">Deadline</label>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="focus-ring w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-haze)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none"
              />
              {due && (
                <button onClick={() => setDue("")} title="Clear deadline" className="focus-ring hairline rounded-lg px-2.5 py-2 text-xs text-[var(--color-mute)]">
                  ✕
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">Priority</label>
            <div className="mt-1 flex gap-1.5">
              {PRIOS.map((p) => (
                <button
                  key={p.v}
                  onClick={() => setPriority(p.v)}
                  className={`focus-ring flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    priority === p.v ? "text-[var(--color-ink)]" : "text-[var(--color-mute)]"
                  }`}
                  style={priority === p.v ? { borderColor: p.color, background: `color-mix(in srgb, ${p.color} 14%, transparent)` } : { borderColor: "var(--color-edge)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {task.dueAt && !overdue && <p className="mt-3 text-center text-xs text-[var(--color-faint)]">{formatIst(task.dueAt)}</p>}

        {stale && (
          <div className="mt-4 rounded-xl border border-[var(--color-amber)]/40 bg-[var(--color-amber)]/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--color-amber)]">🕰 This hasn&apos;t moved in a while</span>
              {!triageMsg && (
                <button onClick={runTriage} disabled={triaging} className="focus-ring rounded-lg bg-[var(--color-amber)]/20 px-2.5 py-1 text-xs font-medium text-[var(--color-amber)] disabled:opacity-50">
                  {triaging ? "Thinking…" : "What should I do?"}
                </button>
              )}
            </div>
            {triageMsg && (
              <div className="mt-2 text-sm text-[var(--color-ink)]">
                <span className="font-semibold capitalize">{triageMsg.verdict}</span> — {triageMsg.reason}
                {triageMsg.verdict === "split" && triageMsg.subtasks?.length ? (
                  <button
                    onClick={() => {
                      setSubtasks([...subtasks, ...triageMsg.subtasks!.map((t) => ({ id: crypto.randomUUID(), title: t, done: false }))]);
                      setTriageMsg(null);
                    }}
                    className="focus-ring mt-2 block rounded-lg bg-[var(--color-violet)]/15 px-2.5 py-1 text-xs font-medium text-[var(--color-violet)]"
                  >
                    + Add {triageMsg.subtasks.length} subtasks
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">
              Subtasks{subtasks.length > 0 ? ` · ${subtasks.filter((s) => s.done).length}/${subtasks.length}` : ""}
            </label>
            <button
              onClick={breakDown}
              disabled={decomposing}
              className="focus-ring rounded-lg bg-[var(--color-violet)]/15 px-2.5 py-1 text-xs font-medium text-[var(--color-violet)] disabled:opacity-50"
            >
              {decomposing ? "Thinking…" : "✨ Break it down"}
            </button>
          </div>
          {subtasks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.done} onChange={() => toggleSub(s.id)} className="h-4 w-4 accent-[var(--color-go)]" />
                  <span className={s.done ? "flex-1 text-[var(--color-faint)] line-through" : "flex-1 text-[var(--color-ink)]"}>{s.title}</span>
                  {s.effortMins ? <span className="text-xs text-[var(--color-faint)]">{s.effortMins}m</span> : null}
                  <button onClick={() => removeSub(s.id)} aria-label="remove subtask" className="text-[var(--color-faint)] hover:text-[var(--color-warn)]">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">Repeat</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(["none", "day", "week", "month"] as Freq[]).map((f) => (
              <button
                key={f}
                onClick={() => setFreq(f)}
                className={`focus-ring rounded-lg border px-3 py-1.5 text-xs font-medium ${freq === f ? "text-[var(--color-ink)]" : "text-[var(--color-mute)]"}`}
                style={freq === f ? { borderColor: "var(--color-go)", background: "color-mix(in srgb, var(--color-go) 14%, transparent)" } : { borderColor: "var(--color-edge)" }}
              >
                {f === "none" ? "Never" : f === "day" ? "Daily" : f === "week" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          {freq === "week" && (
            <div className="mt-2 flex gap-1">
              {DOW.map((d, i) => (
                <button
                  key={i}
                  onClick={() => toggleDow(i)}
                  className={`focus-ring h-7 w-7 rounded-full text-xs font-medium ${recurrence?.daysOfWeek?.includes(i) ? "bg-[var(--color-go)] text-black" : "hairline text-[var(--color-mute)]"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Action onClick={() => commit({ status: "in_progress" })} primary>
            ▷ Start now
          </Action>
          <Action onClick={() => commit({ status: "done" })}>✓ Done</Action>
          <Action onClick={() => commit({ isBlocked: !task.isBlocked })}>{task.isBlocked ? "Unblock" : "⛔ Block"}</Action>
          {dirty ? (
            <Action onClick={() => commit({})} primary>
              {busy ? "Saving…" : "Save changes"}
            </Action>
          ) : (
            <Action onClick={onClose}>Close</Action>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          {confirmDel ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--color-warn)]">Delete this task?</span>
              <button onClick={del} className="focus-ring rounded-lg bg-[var(--color-warn)] px-3 py-1 text-xs font-semibold text-white">
                Yes, delete
              </button>
              <button onClick={() => setConfirmDel(false)} className="focus-ring hairline rounded-lg px-3 py-1 text-xs text-[var(--color-mute)]">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="focus-ring text-xs text-[var(--color-faint)] hover:text-[var(--color-warn)]">
              🗑 Delete task
            </button>
          )}
          {dirty && <span className="text-xs text-[var(--color-faint)]">unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}

function Action({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`lift focus-ring rounded-xl px-4 py-3 text-sm font-medium ${
        primary ? "btn-primary" : "hairline text-[var(--color-ink)] hover:bg-[var(--color-haze)]"
      }`}
    >
      {children}
    </button>
  );
}

function countdown(iso: string, now: number): string {
  let ms = new Date(iso).getTime() - now;
  const sign = ms < 0 ? "-" : "";
  ms = Math.abs(ms);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${sign}${days}d`;
  const hh = Math.floor(ms / 3_600_000);
  const mm = Math.floor((ms % 3_600_000) / 60_000);
  const ss = Math.floor((ms % 60_000) / 1000);
  if (hh >= 1) return `${sign}${hh}:${String(mm).padStart(2, "0")}`;
  return `${sign}${mm}:${String(ss).padStart(2, "0")}`;
}
