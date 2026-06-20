import { guard } from "@/lib/auth";
import { getTask } from "@/lib/store";
import { triage } from "@/lib/brain";

export const dynamic = "force-dynamic";

// Triage a stale task: split / delegate / kill / keep + reason.
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { taskId?: unknown };
  if (typeof b.taskId !== "string") return Response.json({ error: "taskId required" }, { status: 400 });
  const t = await getTask(g.owner, b.taskId);
  if (!t) return Response.json({ error: "not found" }, { status: 404 });
  const ageDays = (Date.now() - new Date(t.updatedAt).getTime()) / 86_400_000;
  const { result, degraded } = await triage(t.title, ageDays, t.status);
  return Response.json({ ...result, degraded });
}
