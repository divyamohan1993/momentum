import { guard } from "@/lib/auth";
import { classifyCommand } from "@/lib/brain";
import { applyCommand } from "@/lib/actions";
import { listActiveTasks } from "@/lib/store";

export const dynamic = "force-dynamic";

// Voice/text command pipeline (§3A). Semantic intent → apply with the confidence gate.
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { transcript?: unknown };
  if (typeof b.transcript !== "string" || !b.transcript.trim())
    return Response.json({ error: "transcript required" }, { status: 400 });

  const active = (await listActiveTasks(g.owner)).filter((t) => !t.archivedAt && t.status !== "done");
  const { result, degraded } = await classifyCommand(
    b.transcript.trim(),
    active.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  );

  const outcomes = [];
  for (const cmd of result.commands) outcomes.push(await applyCommand(g.owner, cmd));

  return Response.json({ transcript: result.transcript, outcomes, degraded });
}
