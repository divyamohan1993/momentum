import { guard } from "@/lib/auth";
import { getTask } from "@/lib/store";
import { decompose } from "@/lib/brain";

export const dynamic = "force-dynamic";

// Suggest subtasks for a task (not saved — the client accepts them via PATCH).
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { taskId?: unknown };
  if (typeof b.taskId !== "string") return Response.json({ error: "taskId required" }, { status: 400 });
  const t = await getTask(g.owner, b.taskId);
  if (!t) return Response.json({ error: "not found" }, { status: 404 });
  const { result, degraded } = await decompose(t.title, t.description);
  return Response.json({ subtasks: result.subtasks, degraded });
}
