import { guard } from "@/lib/auth";
import { createTask, getWorkspaceProfile, WorkspaceLimit } from "@/lib/store";
import { patchTask, setStatus, removeTask } from "@/lib/actions";
import { syncReminderForTask } from "@/lib/reminders";
import { TaskInput, TaskPatch, type Task } from "@/lib/types";
import { readBrainBody } from "@/lib/brain-request";
export const dynamic = "force-dynamic";
const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
async function projectAllowed(owner: string, id: string | undefined) {
  return !id || (await getWorkspaceProfile(owner)).projects.some((p) => p.id === id);
}
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true }); if ("res" in g) return g.res;
  const b = await readBrainBody(req); if ("res" in b) return b.res;
  const p = TaskInput.safeParse(b.data);
  if (!p.success || !(await projectAllowed(g.owner, p.data.projectId))) return Response.json({ error: "Invalid task" }, { status: 400 });
  try {
    const task = await createTask(g.owner, p.data);
    await syncReminderForTask(g.owner, task);
    return Response.json({ task });
  } catch (e) { if (e instanceof WorkspaceLimit) return Response.json({ error: e.message }, { status: 429 }); throw e; }
}
export async function PATCH(req: Request) {
  const g = await guard(req, { mutation: true }); if ("res" in g) return g.res;
  const b = await readBrainBody(req); if ("res" in b) return b.res;
  const p = TaskPatch.safeParse(b.data.patch);
  if (!validId(b.data.id) || !p.success || !(await projectAllowed(g.owner, p.data.projectId))) return Response.json({ error: "Invalid task update" }, { status: 400 });
  try {
    const { status, ...rest } = p.data;
    const task = status ? await setStatus(g.owner, b.data.id, status, rest as Partial<Task>) : await patchTask(g.owner, b.data.id, rest as Partial<Task>);
    return task ? Response.json({ task }) : Response.json({ error: "not found" }, { status: 404 });
  } catch (e) { if (e instanceof WorkspaceLimit) return Response.json({ error: e.message }, { status: 429 }); throw e; }
}
export async function DELETE(req: Request) {
  const g = await guard(req, { mutation: true }); if ("res" in g) return g.res;
  const b = await readBrainBody(req); if ("res" in b) return b.res;
  if (!validId(b.data.id)) return Response.json({ error: "Invalid taskId" }, { status: 400 });
  try {
    const ok = await removeTask(g.owner, b.data.id);
    return Response.json({ ok }, { status: ok ? 200 : 404 });
  } catch (e) { if (e instanceof WorkspaceLimit) return Response.json({ error: e.message }, { status: 429 }); throw e; }
}
