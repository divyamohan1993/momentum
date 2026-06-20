"use client";

import { useDroppable } from "@dnd-kit/core";

export default function Column({
  id,
  title,
  accent,
  count,
  children,
}: {
  id: string;
  title: string;
  accent: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={`glass relative rounded-2xl p-3 transition-shadow duration-300 ${isOver ? "glow-signal" : ""}`}
    >
      <div
        className="absolute inset-x-3 top-0 h-px rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center justify-between px-1 pb-3 pt-1">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: accent }}>
          {title}
        </h2>
        <span className="rounded-full bg-black/30 px-2 py-0.5 font-mono text-xs text-[var(--color-faint)]">
          {count}
        </span>
      </div>
      <div className="flex min-h-[7rem] flex-col gap-2.5">{children}</div>
    </section>
  );
}
