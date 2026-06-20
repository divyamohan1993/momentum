import type { Task } from "./types";

/** Client-side API helpers (no server imports — safe for "use client" components). */
export type BoardData = {
  version: number;
  tasks: Task[];
  nextBest: string | null;
  unacknowledged: number;
  brain: boolean;
  push: boolean;
  calendar: boolean;
};

export type CalToday = { enabled: boolean; connected: boolean; busy: { start: string; end: string }[]; free: { start: string; end: string }[] };

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw Object.assign(new Error(`${url} ${r.status}`), { status: r.status });
  return r.json() as Promise<T>;
}

export const api = {
  board: () => req<BoardData>("/api/board"),
  version: () => req<{ version: number }>("/api/board/version"),
  createTask: (t: Partial<Task>) => req<{ task: Task }>("/api/tasks", json(t)),
  patchTask: (id: string, patch: Partial<Task>) =>
    req<{ task: Task }>("/api/tasks", { ...json({ id, patch }), method: "PATCH" }),
  deleteTask: (id: string) => req<{ ok: boolean }>("/api/tasks", { ...json({ id }), method: "DELETE" }),
  capture: (text: string) => req<{ tasks: Task[]; degraded: boolean; count: number }>("/api/capture", json({ text })),
  command: (transcript: string) =>
    req<{ transcript: string; outcomes: { status: string; verb: string; message?: string; task?: Task }[]; degraded: boolean }>(
      "/api/command",
      json({ transcript }),
    ),
  decompose: (taskId: string) => req<{ subtasks: { title: string; effortMins?: number }[]; degraded: boolean }>("/api/decompose", json({ taskId })),
  triage: (taskId: string) => req<{ verdict: string; reason: string; subtasks?: string[]; degraded: boolean }>("/api/triage", json({ taskId })),
  ask: (question: string) =>
    req<{ answer: string; outcomes: { status: string; verb: string; message?: string; task?: Task }[]; degraded: boolean }>("/api/ask", json({ question })),
  briefing: () => req<{ recap: string; topRisk: string; plan: string[]; degraded: boolean }>("/api/briefing", json({})),
  calendarToday: () => req<CalToday>("/api/calendar/today"),
  calendarDisconnect: () => req<{ ok: boolean }>("/api/calendar/disconnect", json({})),
  pushKey: () => req<{ key: string; enabled: boolean }>("/api/push/key"),
  subscribe: (subscription: unknown) => req<{ ok: boolean }>("/api/push/subscribe", json({ subscription })),
  testPush: () => req<{ ok: boolean; sent: number; failed: number }>("/api/push/test", json({})),
  sweep: () => req<{ ok: boolean; fired: number; archived: number }>("/api/sweep", json({})),
  logout: () => fetch("/api/auth/logout", json({})),
};
