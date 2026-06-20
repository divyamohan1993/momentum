import { guard } from "@/lib/auth";
import { createFromCapture, patchTask, setStatus, removeTask } from "@/lib/actions";
import type { Status, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim())
    return Response.json({ error: "title required" }, { status: 400 });
  const [task] = await createFromCapture(g.owner, [
    {
      title: b.title.trim(),
      description: typeof b.description === "string" ? b.description : undefined,
      dueAt: typeof b.dueAt === "string" ? b.dueAt : undefined,
      priority: (b.priority as Task["priority"]) ?? "med",
      priorityConfident: true,
      dueAtConfident: true,
      tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
      escalationPolicy: (b.escalationPolicy as Task["escalationPolicy"]) ?? "default",
    },
  ]);
  return Response.json({ task });
}

export async function PATCH(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; patch?: Record<string, unknown> };
  if (typeof b.id !== "string") return Response.json({ error: "id required" }, { status: 400 });
  const patch = (b.patch ?? {}) as Partial<Task>;
  const { status, ...rest } = patch;
  const task =
    typeof status === "string"
      ? await setStatus(g.owner, b.id, status as Status, rest)
      : await patchTask(g.owner, b.id, patch);
  if (!task) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ task });
}

export async function DELETE(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof b.id !== "string") return Response.json({ error: "id required" }, { status: 400 });
  const ok = await removeTask(g.owner, b.id);
  return Response.json({ ok });
}
