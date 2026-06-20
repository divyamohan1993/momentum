import { guard } from "@/lib/auth";
import { assistant } from "@/lib/brain";
import { applyCommand } from "@/lib/actions";
import { listActiveTasks } from "@/lib/store";

export const dynamic = "force-dynamic";

// Ask-your-board: the brain answers + optionally applies actions (confidence-gated).
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { question?: unknown };
  if (typeof b.question !== "string" || !b.question.trim())
    return Response.json({ error: "question required" }, { status: 400 });

  const active = (await listActiveTasks(g.owner)).filter((t) => !t.archivedAt);
  const { result, degraded } = await assistant(
    b.question.trim(),
    active.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt, priority: t.priority, isBlocked: t.isBlocked })),
  );

  const outcomes = [];
  for (const cmd of result.actions) outcomes.push(await applyCommand(g.owner, cmd));

  return Response.json({ answer: result.answer, outcomes, degraded });
}
