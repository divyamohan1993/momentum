import type { Task } from "./types";
import { hoursUntil } from "./time";

/**
 * Deterministic "what's next" ranker (§3.3 signal half + §16.6 deterministic fallback).
 * Higher score = more urgent / better Next-Best candidate. Explainable by construction:
 * every contribution is named in `reason`. The LLM nuance pass is DEFERRED (§16.6).
 *
 * Only ranked-eligible cards (status `todo`, not archived/deleted) get a meaningful score;
 * `backlog` is the unranked inbox and is excluded from Next-Best (§16.4).
 */
const PRIORITY_WEIGHT: Record<Task["priority"], number> = { high: 40, med: 20, low: 8 };

export function scoreTask(t: Task, now = Date.now()): { score: number; reason: string } {
  const reasons: string[] = [];
  let score = 0;

  // Priority
  score += PRIORITY_WEIGHT[t.priority];
  if (t.priority !== "med") reasons.push(`${t.priority} priority`);

  // Deadline proximity (the dominant signal)
  if (t.dueAt) {
    const h = hoursUntil(t.dueAt);
    if (h <= 0) {
      score += 120;
      reasons.push(`overdue ${Math.round(-h)}h`);
    } else if (h <= 48) {
      const urgency = Math.round((48 - h) * 2); // up to ~96
      score += urgency;
      reasons.push(`due in ${Math.round(h)}h`);
    } else {
      score += Math.max(0, 20 - h / 24);
    }
  }

  // Blocking others on the critical path
  if (t.blocks.length > 0) {
    score += Math.min(40, t.blocks.length * 15);
    reasons.push(`blocks ${t.blocks.length}`);
  }

  // Engagement / state
  if (t.status === "in_progress") {
    score += 10;
    reasons.push("in progress");
  }

  // Blocked cards can't proceed — keep visible but lower as Next-Best
  if (t.isBlocked) {
    score -= 30;
    reasons.push("blocked");
  }

  // Age nudge: stale todo cards drift up slightly so nothing rots silently
  const ageDays = (now - new Date(t.createdAt).getTime()) / 86_400_000;
  if (ageDays > 3 && t.status !== "done") {
    score += Math.min(15, ageDays);
    reasons.push(`${Math.round(ageDays)}d old`);
  }

  const reason = reasons.length ? reasons.join(", ") : "no urgency signals";
  return { score: Math.round(score), reason };
}

/** Annotate + sort a list by deterministic score (descending). Pure. */
export function rankTasks(tasks: Task[], now = Date.now()): Task[] {
  return tasks
    .map((t) => {
      const { score, reason } = scoreTask(t, now);
      return { ...t, rankScore: score, rankReason: reason };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
