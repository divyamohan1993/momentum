import "server-only";
import { createTask, updateTask, getTask, softDeleteTask } from "./store";
import { syncReminderForTask, acknowledge, snooze as snoozeReminder } from "./reminders";
import { nextOccurrence } from "./recurrence";
import { nowUtcIso } from "./time";
import type { CapturedTask, Command, Status, Task } from "./types";

/** High-level operations shared by routes — keep stores/reminders consistent in one place. */

export async function createFromCapture(owner: string, captured: CapturedTask[]): Promise<Task[]> {
  const out: Task[] = [];
  for (const c of captured) {
    const t = await createTask(owner, {
      title: c.title,
      description: c.description ?? "",
      dueAt: c.dueAt ? new Date(c.dueAt).toISOString() : undefined, // normalize any offset → UTC Z
      priority: c.priority,
      effortMins: c.effortMins,
      cognitiveLoad: c.cognitiveLoad,
      tags: c.tags,
      escalationPolicy: c.escalationPolicy,
      recurrence: c.recurrence,
      status: "todo",
    });
    await syncReminderForTask(owner, t);
    out.push(t);
  }
  return out;
}

export async function patchTask(owner: string, taskId: string, patch: Partial<Task>): Promise<Task | null> {
  const t = await updateTask(owner, taskId, patch);
  if (t) await syncReminderForTask(owner, t);
  return t;
}

export async function setStatus(owner: string, taskId: string, status: Status, extra: Partial<Task> = {}): Promise<Task | null> {
  const t = await updateTask(owner, taskId, { status, ...extra });
  if (t) {
    await syncReminderForTask(owner, t);
    if (status === "done") {
      await acknowledge(owner, taskId);
      if (t.recurrence) await spawnNextOccurrence(owner, t);
    }
  }
  return t;
}

/** On completing a recurring task, create the next occurrence. */
async function spawnNextOccurrence(owner: string, t: Task): Promise<void> {
  if (!t.recurrence) return;
  const dueAt = nextOccurrence(t.recurrence, t.dueAt ?? nowUtcIso());
  const next = await createTask(owner, {
    title: t.title,
    description: t.description,
    priority: t.priority,
    effortMins: t.effortMins,
    cognitiveLoad: t.cognitiveLoad,
    tags: t.tags,
    escalationPolicy: t.escalationPolicy,
    recurrence: t.recurrence,
    subtasks: (t.subtasks ?? []).map((s) => ({ ...s, done: false })),
    dueAt,
    status: "todo",
  });
  await syncReminderForTask(owner, next);
}

export async function removeTask(owner: string, taskId: string): Promise<boolean> {
  const ok = await softDeleteTask(owner, taskId);
  if (ok) await acknowledge(owner, taskId).catch(() => {});
  return ok;
}

const VERB_TO_STATUS: Partial<Record<Command["verb"], Status>> = {
  doing: "in_progress",
  done: "done",
  reopen: "in_progress",
};

export type CommandOutcome = {
  status: "applied" | "confirm" | "created" | "query" | "skip";
  verb: Command["verb"];
  task?: Task;
  message?: string;
  candidates?: { id: string; title: string }[];
};

/** Apply one classified command with the confidence gate (§3A "ask, don't guess"). */
export async function applyCommand(owner: string, cmd: Command, minConf = 0.6): Promise<CommandOutcome> {
  if (cmd.verb === "want") {
    if (cmd.newTask) {
      const [t] = await createFromCapture(owner, [cmd.newTask]);
      return { status: "created", verb: cmd.verb, task: t };
    }
    return { status: "skip", verb: cmd.verb, message: "nothing to create" };
  }
  if (cmd.verb === "query") return { status: "query", verb: cmd.verb };

  if (!cmd.cardRef || cmd.confidence < minConf)
    return { status: "confirm", verb: cmd.verb, message: "Which card did you mean?" };

  const task = await getTask(owner, cmd.cardRef);
  if (!task) return { status: "confirm", verb: cmd.verb, message: "Couldn't match that to a card." };

  if (cmd.verb === "blocked") {
    const t = await patchTask(owner, task.id, { isBlocked: true });
    return { status: "applied", verb: cmd.verb, task: t ?? task };
  }
  if (cmd.verb === "snooze") {
    await snoozeReminder(owner, task.id);
    return { status: "applied", verb: cmd.verb, task };
  }
  const status = VERB_TO_STATUS[cmd.verb];
  if (status) {
    const t = await setStatus(owner, task.id, status);
    return { status: "applied", verb: cmd.verb, task: t ?? task };
  }
  return { status: "skip", verb: cmd.verb };
}
