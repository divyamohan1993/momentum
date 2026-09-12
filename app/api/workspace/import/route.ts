import { z } from "zod";
import { guard } from "@/lib/auth";
import { TaskInput, Project } from "@/lib/types";
import { readBrainBody } from "@/lib/brain-request";
import { createTasksBatch, getWorkspaceProfile, WorkspaceLimit } from "@/lib/store";
export const dynamic = "force-dynamic";
const Backup = z.object({ tasks: z.array(TaskInput.extend({ completedAt: z.string().datetime().optional() })).min(1).max(200), projects: z.array(Project).max(50).default([]) });
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true }); if ("res" in g) return g.res;
  const body = await readBrainBody(req, 1_000_000); if ("res" in body) return body.res;
  const parsed = Backup.safeParse(body.data);
  if (!parsed.success) return Response.json({ error: "Upload a Momentum JSON backup with 1–200 valid tasks" }, { status: 400 });
  try {
    const tasks = await createTasksBatch(g.owner, parsed.data.tasks.map((t) => ({ ...t,
      subtasks: t.subtasks.map((s) => ({ ...s, id: crypto.randomUUID() })),
      remindersEnabled: false,
    })), parsed.data.projects);
    return Response.json({ count: tasks.length });
  } catch (e) { if (e instanceof WorkspaceLimit) return Response.json({ error: e.message }, { status: 429 }); throw e; }
}
