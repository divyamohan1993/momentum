"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/types";
import { api } from "@/lib/client";
import { formatIst, hoursUntil } from "@/lib/time";

const PRIORITY_ACCENT: Record<Task["priority"], string> = {
  high: "var(--color-signal)", // rose — energy
  med: "var(--color-amber)", // warm amber
  low: "var(--color-violet)", // calm violet
};

export default function TaskCard({
  task,
  isNextBest,
  onOpen,
  onChange,
  dragging,
}: {
  task: Task;
  isNextBest: boolean;
  onOpen?: () => void;
  onChange?: () => void;
  dragging?: boolean;
}) {
  if (dragging) return <CardView task={task} isNextBest={isNextBest} dragging />;
  return <DraggableCard task={task} isNextBest={isNextBest} onOpen={onOpen} onChange={onChange} />;
}

function DraggableCard({
  task,
  isNextBest,
  onOpen,
  onChange,
}: {
  task: Task;
  isNextBest: boolean;
  onOpen?: () => void;
  onChange?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
    >
      <CardView task={task} isNextBest={isNextBest} onOpen={onOpen} onChange={onChange} />
    </div>
  );
}

export function CardView({
  task,
  isNextBest,
  onOpen,
  onChange,
  dragging,
}: {
  task: Task;
  isNextBest: boolean;
  onOpen?: () => void;
  onChange?: () => void;
  dragging?: boolean;
}) {
  const accent = PRIORITY_ACCENT[task.priority];
  const h = task.dueAt ? hoursUntil(task.dueAt) : null;
  const overdue = h !== null && h <= 0 && task.status !== "done";
  const pressure = h === null ? 0 : Math.max(0, Math.min(1, 1 - h / 48));
  const pressureColor = overdue ? "var(--color-magenta)" : pressure > 0.6 ? "var(--color-amber)" : "var(--color-signal)";

  async function quick(e: React.MouseEvent, patch: Partial<Task>) {
    e.stopPropagation();
    await api.patchTask(task.id, patch).catch(() => {});
    onChange?.();
  }

  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen?.()}
      aria-label={`${task.title}${task.dueAt ? ", due " + formatIst(task.dueAt) : ""}${task.isBlocked ? ", blocked" : ""}`}
      className={`lift group relative cursor-grab overflow-hidden rounded-xl bg-[var(--color-panel)]/80 p-3 hairline active:cursor-grabbing ${
        dragging ? "glow-signal rotate-[1.5deg] scale-[1.03] shadow-2xl" : "hover:-translate-y-0.5"
      } ${isNextBest ? "ring-1 ring-[var(--color-signal)]/50" : ""}`}
      style={isNextBest ? { boxShadow: "0 10px 40px -12px rgba(54,230,255,0.4)" } : undefined}
    >
      {isNextBest && (
        <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--color-signal)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-signal)]">
          ★ NEXT BEST {task.rankReason ? `· ${task.rankReason}` : ""}
        </div>
      )}

      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
        <p className="line-clamp-3 text-sm font-medium leading-snug text-[var(--color-ink)]">{task.title}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {task.dueAt && (
          <span className="rounded-md px-1.5 py-0.5 font-mono" style={{ background: `${pressureColor}1a`, color: pressureColor }}>
            {overdue ? "⚠ overdue" : "⏱"} {shortDue(task.dueAt)}
          </span>
        )}
        {task.isBlocked && <span className="rounded-md bg-[var(--color-magenta)]/15 px-1.5 py-0.5 text-[var(--color-magenta)]">⛔ blocked</span>}
        {task.cognitiveLoad && (
          <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[var(--color-mute)]">{task.cognitiveLoad === "deep" ? "🧠 deep" : "⚡ quick"}</span>
        )}
        {task.effortMins ? <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[var(--color-mute)]">{task.effortMins}m</span> : null}
        {task.escalationPolicy === "critical" && <span className="rounded-md bg-[var(--color-magenta)]/20 px-1.5 py-0.5 text-[var(--color-magenta)]">critical</span>}
        {task.tags.slice(0, 2).map((t) => (
          <span key={t} className="rounded-md bg-[var(--color-violet)]/12 px-1.5 py-0.5 text-[var(--color-violet)]">
            #{t}
          </span>
        ))}
      </div>

      {task.dueAt && task.status !== "done" && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(pressure * 100)}%`, background: pressureColor }} />
        </div>
      )}

      {!dragging && (
        <div className="pointer-events-none mt-2 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          {task.status !== "in_progress" && (
            <QuickBtn label="Start" onClick={(e) => quick(e, { status: "in_progress" })}>▷</QuickBtn>
          )}
          {task.status !== "done" && (
            <QuickBtn label="Done" onClick={(e) => quick(e, { status: "done" })}>✓</QuickBtn>
          )}
          <QuickBtn label={task.isBlocked ? "Unblock" : "Block"} onClick={(e) => quick(e, { isBlocked: !task.isBlocked })}>
            ⛔
          </QuickBtn>
        </div>
      )}
    </article>
  );
}

function QuickBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-ring rounded-md bg-black/40 px-2 py-1 text-xs text-[var(--color-mute)] transition hover:bg-black/60 hover:text-[var(--color-ink)]"
    >
      {children}
    </button>
  );
}

function shortDue(iso: string): string {
  const h = hoursUntil(iso);
  if (h <= 0) return `${Math.round(-h)}h ago`;
  if (h < 24) return `${Math.round(h)}h`;
  return formatIst(iso).replace(" IST", "");
}
