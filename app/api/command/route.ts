import { readBrainBody } from "@/lib/brain-request";
import { guard } from "@/lib/auth";
import { classifyCommand } from "@/lib/brain";
import { applyCommand } from "@/lib/actions";
import { listActiveTasks } from "@/lib/store";

export const dynamic = "force-dynamic";

// Voice/text command pipeline (§3A). Semantic intent → apply with the confidence gate.
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const body = await readBrainBody(req);
  if ("res" in body) return body.res;
  const b = body.data;
  if (typeof b.transcript !== "string" || !b.transcript.trim())
    return Response.json({ error: "transcript required" }, { status: 400 });

  if ((b.transcript as string).length > 6000) return Response.json({ error: "Use at most 6000 characters" }, { status: 413 });

  const active = (await listActiveTasks(g.owner)).filter((t) => !t.archivedAt);

  const { result, degraded } = await classifyCommand(g.owner,
    b.transcript.trim(),
    active.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  );

  const outcomes = [];
  for (const cmd of result.commands) outcomes.push(await applyCommand(g.owner, cmd));

  return Response.json({ transcript: result.transcript, outcomes, degraded });
}
