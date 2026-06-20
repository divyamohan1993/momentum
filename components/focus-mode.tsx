"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/types";
import { api } from "@/lib/client";
import { formatIst, hoursUntil } from "@/lib/time";

/** Focus Mode (§1): the rest of the world dims, one card fills the screen with a countdown ring. */
export default function FocusMode({ task, onClose, onChange }: { task: Task; onClose: () => void; onChange: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const h = task.dueAt ? hoursUntil(task.dueAt) : null;
  // ring fill = progress toward deadline within a 48h horizon
  const frac = h === null ? 0 : Math.max(0, Math.min(1, 1 - h / 48));
  const overdue = h !== null && h <= 0;
  const ringColor = overdue ? "#f0606e" : frac > 0.6 ? "#ff9e43" : "#38bdf8";
  const C = 2 * Math.PI * 86;

  async function act(patch: Partial<Task>) {
    await api.patchTask(task.id, patch).catch(() => {});
    onChange();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-6 backdrop-blur-md materialize"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
    >
      <div className="glass w-full max-w-lg rounded-3xl p-8 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="relative mx-auto h-52 w-52">
          <svg viewBox="0 0 200 200" className="h-52 w-52 -rotate-90">
            <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(120,134,190,0.18)" strokeWidth="10" />
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
              style={{ transition: "stroke-dashoffset 1s linear", filter: `drop-shadow(0 0 10px ${ringColor})` }}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center">
            <div className="text-3xl font-bold tracking-tight" style={{ color: ringColor }}>
              {task.dueAt ? countdown(task.dueAt, now) : "—"}
            </div>
            <div className="mt-1 text-xs text-[var(--color-faint)]">{task.dueAt ? (overdue ? "overdue" : "until due") : "no deadline"}</div>
          </div>
        </div>

        <h2 className="mt-6 text-balance text-xl font-semibold leading-snug">{task.title}</h2>
        {task.dueAt && <p className="mt-1 text-sm text-[var(--color-mute)]">{formatIst(task.dueAt)}</p>}
        {task.rankReason && <p className="mt-2 text-xs text-[var(--color-faint)]">ranked: {task.rankReason}</p>}

        <div className="mt-7 grid grid-cols-2 gap-2.5">
          <Action onClick={() => act({ status: "in_progress" })} primary>
            ▷ Start now
          </Action>
          <Action onClick={() => act({ status: "done" })}>✓ Done</Action>
          <Action onClick={() => act({ isBlocked: !task.isBlocked })}>{task.isBlocked ? "Unblock" : "⛔ Block"}</Action>
          <Action onClick={onClose}>Close (Esc)</Action>
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
