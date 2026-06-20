import { z } from "zod";

/**
 * Shared contracts (Zod = single source of truth, §6 of the design).
 * Dates are ISO-8601 UTC strings everywhere so Server Actions can serialize them
 * to the client without Timestamp wrappers. UTC ISO strings sort
 * lexicographically == chronologically, so Firestore range queries on `dueAt` work.
 */

export const STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
export const PRIORITIES = ["low", "med", "high"] as const;
export const LOADS = ["deep", "shallow"] as const;
export const POLICIES = ["default", "important", "critical"] as const;

export const Status = z.enum(STATUSES);
export const Priority = z.enum(PRIORITIES);
export const CognitiveLoad = z.enum(LOADS);
export const EscalationPolicy = z.enum(POLICIES);

export type Status = z.infer<typeof Status>;
export type Priority = z.infer<typeof Priority>;
export type CognitiveLoad = z.infer<typeof CognitiveLoad>;
export type EscalationPolicy = z.infer<typeof EscalationPolicy>;

export const Subtask = z.object({
  id: z.string(),
  title: z.string().min(1).max(300),
  done: z.boolean().default(false),
  effortMins: z.number().int().positive().optional(),
});
export type Subtask = z.infer<typeof Subtask>;

/** Simple repeat rule. On completion, the next occurrence is spawned. */
export const Recurrence = z.object({
  every: z.enum(["day", "week", "month"]),
  interval: z.number().int().positive().default(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(), // for weekly (0=Sun) — e.g. 3x/week
});
export type Recurrence = z.infer<typeof Recurrence>;

/** A task/card. `isBlocked` is a flag, not a status (§16.4). */
export const Task = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).default(""),
  status: Status.default("todo"),
  priority: Priority.default("med"),
  isBlocked: z.boolean().default(false),
  blockedReason: z.string().max(500).optional(),
  dueAt: z.string().datetime().optional(),
  effortMins: z.number().int().positive().max(100000).optional(),
  cognitiveLoad: CognitiveLoad.optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string().max(40)).default([]),
  dependsOn: z.array(z.string()).default([]),
  blocks: z.array(z.string()).default([]),
  subtasks: z.array(Subtask).default([]),
  recurrence: Recurrence.optional(),
  escalationPolicy: EscalationPolicy.default("default"),
  rankScore: z.number().default(0),
  rankReason: z.string().default(""),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  archivedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().optional(),
});
export type Task = z.infer<typeof Task>;

/** What the brain proposes from a brain-dump. Confidence flags gate "ask, don't guess". */
export const CapturedTask = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(), // accept IST-offset from the brain; normalized to UTC on store
  dueAtRaw: z.string().optional(), // the phrase the user said, for the echo-back
  dueAtConfident: z.boolean().default(true),
  priority: Priority.default("med"),
  priorityConfident: z.boolean().default(true),
  effortMins: z.number().int().positive().optional(),
  cognitiveLoad: CognitiveLoad.optional(),
  tags: z.array(z.string()).default([]),
  escalationPolicy: EscalationPolicy.default("default"),
  recurrence: Recurrence.optional(),
});
export type CapturedTask = z.infer<typeof CapturedTask>;

export const CaptureResult = z.object({ tasks: z.array(CapturedTask) });
export type CaptureResult = z.infer<typeof CaptureResult>;

/** Voice/text command verbs — inferred SEMANTICALLY, never by keyword (§3A). */
export const Verb = z.enum(["want", "doing", "done", "blocked", "query", "reopen", "snooze"]);
export type Verb = z.infer<typeof Verb>;

export const Command = z.object({
  verb: Verb,
  cardRef: z.string().optional(), // the spoken phrase referring to an existing card
  newTask: CapturedTask.optional(), // for `want`
  deadlineIST: z.string().datetime({ offset: true }).optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type Command = z.infer<typeof Command>;

export const CommandResult = z.object({
  transcript: z.string(),
  commands: z.array(Command),
});
export type CommandResult = z.infer<typeof CommandResult>;

// ─── Intelligence contracts ───
export const DecomposeResult = z.object({
  subtasks: z.array(z.object({ title: z.string().min(1).max(300), effortMins: z.number().int().positive().optional() })),
});
export type DecomposeResult = z.infer<typeof DecomposeResult>;

export const TriageResult = z.object({
  verdict: z.enum(["split", "delegate", "kill", "keep"]),
  reason: z.string(),
  subtasks: z.array(z.string()).optional(),
});
export type TriageResult = z.infer<typeof TriageResult>;

/** "Ask your board": a natural answer plus optional actions to apply (confirm-gated). */
export const AssistantResult = z.object({
  answer: z.string(),
  actions: z.array(Command).default([]),
});
export type AssistantResult = z.infer<typeof AssistantResult>;

export const BriefingResult = z.object({
  recap: z.string(),
  topRisk: z.string(),
  plan: z.array(z.string()),
});
export type BriefingResult = z.infer<typeof BriefingResult>;

/** Reminder / escalation state (§16.3 mechanics in a sweep model — D4). */
export const ReminderStatus = z.enum(["pending", "sent", "acknowledged", "paused", "cancelled"]);
export type ReminderStatus = z.infer<typeof ReminderStatus>;

export const Reminder = z.object({
  id: z.string(),
  ownerId: z.string(),
  taskId: z.string(),
  fireAt: z.string().datetime(), // next time this should fire/check
  currentRung: z.number().int().min(0).max(1).default(0),
  repeatCount: z.number().int().min(0).default(0),
  status: ReminderStatus.default("pending"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSentAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
});
export type Reminder = z.infer<typeof Reminder>;

/** A browser Web Push subscription (no phone number stored — §11 PII minimization). */
export const PushSub = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  createdAt: z.string().datetime(),
  label: z.string().optional(),
});
export type PushSub = z.infer<typeof PushSub>;

/** Fixed escalation intervals (§16.6 DEFER adaptive → fixed). Minutes. */
export const RUNG0_REPEAT_MINUTES = 10;
export const RUNG0_MAX_REPEATS = 3;
export const ESCALATION_INTERVALS: Record<EscalationPolicy, number> = {
  default: 30,
  important: 10,
  critical: 3,
};
