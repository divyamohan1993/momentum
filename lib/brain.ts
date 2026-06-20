import "server-only";
import { env, brainEnabled } from "./config";
import { reserveGeminiCall } from "./store";
import { CaptureResult, CommandResult, DecomposeResult, TriageResult, AssistantResult, BriefingResult, type Task } from "./types";
import { nowContextForBrain } from "./time";

/**
 * The brain: one thin Gemini function (§16.6 — no multi-LLM router), strict-JSON contracts,
 * daily-cap reservation BEFORE every call (cost guard). Capture degrades honestly when the
 * brain is unavailable; intent classification stays semantic (never keyword-guesses).
 */
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export class BrainUnavailable extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gemini(systemText: string, userText: string): Promise<string> {
  if (!brainEnabled()) throw new BrainUnavailable("no api key");
  const reservation = await reserveGeminiCall(env().geminiDailyCap);
  if (!reservation.allowed) throw new BrainUnavailable("daily cap reached");

  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };

  // The free Gemini tier 503s under load — retry transient 5xx (not 429/4xx).
  let lastErr = "gemini unavailable";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(300 * attempt * attempt); // 0, 300, 1200ms
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT(env().geminiModel)}?key=${env().geminiApiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
    } catch (e) {
      lastErr = `gemini fetch ${(e as Error).message}`;
      continue; // network/timeout — retry
    }
    if (res.ok) {
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text) return text;
      lastErr = "empty response";
      continue;
    }
    lastErr = `gemini http ${res.status}`;
    if (res.status < 500) break; // 4xx (incl 429 quota) — don't retry
  }
  throw new BrainUnavailable(lastErr);
}

function parseJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(t);
}

export async function capture(text: string): Promise<{ result: CaptureResult; degraded: boolean }> {
  const sys = `You are Momentum's capture parser. ${nowContextForBrain()}
Return ONLY JSON: {"tasks":[{"title","description?","dueAt?"(UTC ISO 8601),"dueAtRaw?","dueAtConfident"(boolean),"priority"("low"|"med"|"high"),"priorityConfident"(boolean),"effortMins?"(integer),"cognitiveLoad?"("deep"|"shallow"),"tags?"[],"escalationPolicy"("default"|"important"|"critical")}]}.
Split a brain-dump into separate tasks. Resolve relative/fuzzy time ("tomorrow evening", "Sunday", "in 2 hours", "before lunch") to a concrete UTC ISO instant from the IST now above. Vague-word defaults (IST): morning 09:00, noon 12:00, afternoon 15:00, evening 18:00, night 21:00, EOD 23:59. If a date is inferred/uncertain, set dueAtConfident=false and put the original phrase in dueAtRaw. Use escalationPolicy="critical" only when explicitly urgent or a hard deadline, "important" for clearly time-sensitive, else "default". If a task implies repetition ("daily", "every week", "every Monday", "3x/week", "monthly"), include recurrence {"every":"day"|"week"|"month","interval":int,"daysOfWeek":[0-6 where 0=Sunday]} — e.g. "gym 3x/week" → {"every":"week","interval":1,"daysOfWeek":[1,3,5]}. No markdown, no prose.`;
  try {
    const raw = await gemini(sys, text);
    const result = CaptureResult.parse(parseJson(raw));
    if (result.tasks.length === 0) throw new Error("no tasks");
    return { result, degraded: false };
  } catch {
    const lines = text
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tasks = (lines.length ? lines : [text]).map((l) => ({
      title: l.slice(0, 200),
      priority: "med" as const,
      priorityConfident: false,
      dueAtConfident: false,
      tags: [],
      escalationPolicy: "default" as const,
    }));
    return { result: CaptureResult.parse({ tasks }), degraded: true };
  }
}

export async function classifyCommand(
  transcript: string,
  tasks: Pick<Task, "id" | "title" | "status">[],
): Promise<{ result: CommandResult; degraded: boolean }> {
  const cards = tasks.map((t) => `${t.id} :: ${t.title} [${t.status}]`).join("\n");
  const sys = `You are Momentum's voice-command classifier. ${nowContextForBrain()}
Infer intent SEMANTICALLY from natural speech — there are NO trigger words, any wording is valid. Verbs:
- "want": create a new task (lands in TO-DO).
- "doing": user is starting/working a task (→ DOING).
- "done": user finished a task (→ DONE).
- "blocked": user is blocked on a task.
- "reopen": move a finished task back to active.
- "snooze": remind later.
- "query": a question such as "what's next".
Resolve which active card each command refers to; return that card's id as cardRef when reasonably confident. If ambiguous or unmatched, omit cardRef (for "want", provide newTask instead). Include confidence 0..1. Resolve any spoken deadline to a UTC ISO instant in deadlineIST.
Return ONLY JSON: {"transcript":string,"commands":[{"verb","cardRef?","newTask?"{"title","priority","escalationPolicy","dueAt?"},"deadlineIST?","confidence"}]}.
Active cards:
${cards || "(none)"}`;
  try {
    const raw = await gemini(sys, transcript);
    const result = CommandResult.parse(parseJson(raw));
    return { result, degraded: false };
  } catch {
    return { result: { transcript, commands: [] }, degraded: true };
  }
}

/** Break a task into ordered subtasks with effort estimates. */
export async function decompose(title: string, description?: string): Promise<{ result: DecomposeResult; degraded: boolean }> {
  const sys = `You break a task into 3-7 concrete, ordered subtasks — each a small actionable step with a rough effort estimate in minutes. Return ONLY JSON {"subtasks":[{"title","effortMins"}]}. No prose, no markdown.`;
  try {
    const raw = await gemini(sys, `Task: ${title}${description ? `\nContext: ${description}` : ""}`);
    const result = DecomposeResult.parse(parseJson(raw));
    if (!result.subtasks.length) throw new Error("empty");
    return { result, degraded: false };
  } catch {
    return { result: { subtasks: [] }, degraded: true };
  }
}

/** Decide what to do with a stale task. */
export async function triage(title: string, ageDays: number, status: string): Promise<{ result: TriageResult; degraded: boolean }> {
  const sys = `A task has sat in "${status}" for ${Math.round(ageDays)} days with no progress. Decide one verdict: "split" (too big — give 2-5 subtasks), "delegate" (hand it off), "kill" (no longer worth doing), or "keep" (still valid, just needs doing). Return ONLY JSON {"verdict","reason"(one short sentence),"subtasks"(array of strings, ONLY if verdict is split)}.`;
  try {
    const raw = await gemini(sys, `Task: ${title}`);
    return { result: TriageResult.parse(parseJson(raw)), degraded: false };
  } catch {
    return { result: { verdict: "keep", reason: "Couldn't analyse this right now." }, degraded: true };
  }
}

/** Ask-your-board assistant: answers a question and optionally proposes actions. */
export async function assistant(
  question: string,
  tasks: Pick<Task, "id" | "title" | "status" | "dueAt" | "priority" | "isBlocked">[],
): Promise<{ result: AssistantResult; degraded: boolean }> {
  const cards = tasks
    .map((t) => `${t.id} :: ${t.title} [${t.status}${t.isBlocked ? ",blocked" : ""}${t.dueAt ? ",due " + t.dueAt : ""}${t.priority !== "med" ? "," + t.priority : ""}]`)
    .join("\n");
  const sys = `You are Momentum's assistant over the user's task board. ${nowContextForBrain()}
Answer the user's question conversationally and briefly using the board below. If they ask to CHANGE the board (move/start/finish/block/snooze/reopen/create/reschedule), ALSO return actions[]: each {"verb":"want|doing|done|blocked|reopen|snooze|query","cardRef"(the exact card id),"newTask"{"title","priority","escalationPolicy","dueAt?"},"deadlineIST"(UTC ISO),"confidence"(0..1)}. Use the exact card id for cardRef. Return ONLY JSON {"answer": string, "actions": [...]}. Keep answer under 60 words.
Board:
${cards || "(empty board)"}`;
  try {
    const raw = await gemini(sys, question);
    return { result: AssistantResult.parse(parseJson(raw)), degraded: false };
  } catch {
    return { result: { answer: "The brain is unavailable right now — try again, or use the board directly.", actions: [] }, degraded: true };
  }
}

/** Weekly chief-of-staff briefing. */
export async function briefing(boardSummary: string): Promise<{ result: BriefingResult; degraded: boolean }> {
  const sys = `You are Momentum's chief of staff writing a short, motivating weekly briefing. ${nowContextForBrain()}
From the board summary, produce: a 1-2 sentence recap of what got done, the single biggest risk this week, and a focused plan of 3-5 specific bullets for the week ahead. Be concrete, never generic. Return ONLY JSON {"recap","topRisk","plan":[...]}.`;
  try {
    const raw = await gemini(sys, boardSummary);
    return { result: BriefingResult.parse(parseJson(raw)), degraded: false };
  } catch {
    return { result: { recap: "Briefing unavailable right now.", topRisk: "—", plan: [] }, degraded: true };
  }
}
