"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/types";
import { api } from "@/lib/client";
import { formatIst, hoursUntil } from "@/lib/time";

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
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

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
  const dirty = title !== task.title || due !== toLocalInput(task.dueAt) || priority !== task.priority;

  const fieldPatch = (): Partial<Task> => ({ title: title.trim(), dueAt: (due ? fromLocalInput(due) : "") as string, priority });

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
      <div className="glass w-full max-w-lg rounded-3xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
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
