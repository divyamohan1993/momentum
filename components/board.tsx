"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Task, Status } from "@/lib/types";
import { api, type BoardData } from "@/lib/client";
import TaskCard from "./task-card";
import Column from "./column";
import CaptureBar from "./capture-bar";
import CommandPalette from "./command-palette";
import FocusMode from "./focus-mode";
import Aurora from "./aurora";
import { registerPush } from "@/lib/push-client";

type ColumnDef = { id: string; title: string; statuses: Status[]; target: Status; accent: string };
const COLUMNS: ColumnDef[] = [
  { id: "todo", title: "To-Do", statuses: ["backlog", "todo"], target: "todo", accent: "var(--color-sky)" },
  { id: "doing", title: "Doing", statuses: ["in_progress"], target: "in_progress", accent: "var(--color-amber)" },
  { id: "done", title: "Done", statuses: ["done"], target: "done", accent: "var(--color-go)" },
];

export default function Board({ initial }: { initial: BoardData }) {
  const [data, setData] = useState<BoardData>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notifOn, setNotifOn] = useState(false);
  const versionRef = useRef(initial.version);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const refresh = useCallback(async () => {
    try {
      const b = await api.board();
      versionRef.current = b.version;
      setData(b);
    } catch (e) {
      if ((e as { status?: number }).status === 401) window.location.href = "/login";
    }
  }, []);

  // Lightweight ₹0 polling: check the 1-doc version; only refetch the board on change.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { version } = await api.version();
        if (alive && version !== versionRef.current) await refresh();
      } catch {
        /* ignore transient */
      }
    };
    const iv = setInterval(tick, 4000);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // Service worker, focus deep-link, notification status, and live OS-theme following.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (focus) setFocusId(focus);

    // Already subscribed? then hide the "enable notifications" button.
    (async () => {
      try {
        if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (await reg.pushManager.getSubscription()) setNotifOn(true);
        }
      } catch {
        /* ignore */
      }
    })();

    // Follow the OS light/dark setting live (no manual toggle).
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => document.documentElement.classList.toggle("dark", mq.matches);
    mq.addEventListener("change", onTheme);
    return () => mq.removeEventListener("change", onTheme);
  }, []);

  // ⌘K / keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setFocusId(null);
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of data.tasks) {
      const col = COLUMNS.find((c) => c.statuses.includes(t.status));
      if (col) g[col.id]!.push(t);
    }
    return g;
  }, [data.tasks]);

  // Optimistic move between columns
  const move = useCallback(
    async (taskId: string, target: Status) => {
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, status: target } : t)),
      }));
      try {
        await api.patchTask(taskId, { status: target });
      } catch {
        flash("Couldn't move card");
      }
      refresh();
    },
    [flash, refresh],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      const over = e.over?.id?.toString();
      if (!over) return;
      const col = COLUMNS.find((c) => c.id === over);
      if (!col) return;
      const task = data.tasks.find((t) => t.id === e.active.id);
      if (task && task.status !== col.target) move(task.id, col.target);
    },
    [data.tasks, move],
  );

  const activeTask = data.tasks.find((t) => t.id === activeId) ?? null;
  const focusTask = data.tasks.find((t) => t.id === focusId) ?? null;

  return (
    <>
      <Aurora />
      <main className="mx-auto flex min-h-dvh max-w-[1400px] flex-col px-4 pb-10 pt-5 sm:px-6">
        <Header
          data={data}
          notifOn={notifOn}
          onPalette={() => setPaletteOpen(true)}
          onEnable={async () => {
            const ok = await registerPush(flash);
            if (ok) {
              setNotifOn(true);
              const r = await api.testPush().catch(() => null);
              flash(r?.sent ? "Notifications on 🔔" : "Notifications on (no device yet)");
            }
          }}
        />

        {data.unacknowledged > 0 && (
          <div className="hairline mt-3 flex items-center gap-2 rounded-xl bg-[var(--color-magenta)]/10 px-4 py-2 text-sm text-[var(--color-magenta)]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-magenta)]" />
            {data.unacknowledged} reminder{data.unacknowledged > 1 ? "s" : ""} still unacknowledged — nothing should rot silently.
          </div>
        )}

        <CaptureBar brain={data.brain} onDone={(m) => { refresh(); if (m) flash(m); }} onFocusNext={() => data.nextBest && setFocusId(data.nextBest)} />

        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(e.active.id.toString())}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="mt-5 grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
            {COLUMNS.map((c) => (
              <Column key={c.id} id={c.id} title={c.title} accent={c.accent} count={grouped[c.id]!.length}>
                {grouped[c.id]!.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isNextBest={t.id === data.nextBest}
                    onOpen={() => setFocusId(t.id)}
                    onChange={refresh}
                  />
                ))}
              </Column>
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask ? <TaskCard task={activeTask} isNextBest={false} dragging /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {paletteOpen && (
        <CommandPalette
          tasks={data.tasks}
          brain={data.brain}
          onClose={() => setPaletteOpen(false)}
          onDone={(m) => { refresh(); if (m) flash(m); }}
          onFocus={(id) => setFocusId(id)}
        />
      )}

      {focusTask && <FocusMode task={focusTask} onClose={() => setFocusId(null)} onChange={refresh} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full glass px-5 py-2.5 text-sm shadow-2xl materialize">
          {toast}
        </div>
      )}
    </>
  );
}

function Header({
  data,
  notifOn,
  onPalette,
  onEnable,
}: {
  data: BoardData;
  notifOn: boolean;
  onPalette: () => void;
  onEnable: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl glass">
          <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
            <defs>
              <linearGradient id="logoM" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff8a4c" />
                <stop offset="0.5" stopColor="#ff4d8d" />
                <stop offset="1" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="19" fill="none" stroke="var(--color-edge)" strokeWidth="6" />
            <circle cx="32" cy="32" r="19" fill="none" stroke="url(#logoM)" strokeWidth="6" strokeLinecap="round" strokeDasharray="90 200" transform="rotate(-90 32 32)" />
            <circle cx="32" cy="13" r="5.5" fill="url(#logoM)" />
          </svg>
        </div>
        <div>
          <h1 className="text-grad text-xl font-extrabold leading-none tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Momentum
          </h1>
          <p className="mt-1 text-xs text-[var(--color-faint)]">
            {data.brain ? "Brain online" : "Brain offline · manual mode"} · your chief of staff
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {data.push && !notifOn && (
          <button onClick={onEnable} className="lift focus-ring hairline rounded-lg px-3 py-2 text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)]">
            🔔 Enable notifications
          </button>
        )}
        <button onClick={onPalette} className="lift focus-ring hairline rounded-lg px-3 py-2 text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)]">
          <kbd className="font-mono">⌘K</kbd> commands
        </button>
        <button
          onClick={() => api.logout().then(() => (window.location.href = "/login"))}
          className="lift focus-ring hairline rounded-lg px-3 py-2 text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)]"
        >
          Exit
        </button>
      </div>
    </header>
  );
}
