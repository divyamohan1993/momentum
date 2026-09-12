import { z } from "zod";
import { guard } from "@/lib/auth";
import { Project } from "@/lib/types";
import { readBrainBody } from "@/lib/brain-request";
import { getWorkspaceProfile, updateWorkspaceProfile, WorkspaceLimit } from "@/lib/store";
import { validTimeZone } from "@/lib/workspace-policy";
export const dynamic = "force-dynamic";
const Patch = z.object({ timeZone: z.string().refine(validTimeZone).optional(), projects: z.array(Project).max(50).refine((p) => new Set(p.map((x) => x.id)).size === p.length).optional() }).strict();
export async function GET(req: Request) {
  const g = await guard(req); if ("res" in g) return g.res;
  return Response.json({ profile: await getWorkspaceProfile(g.owner) });
}
export async function PATCH(req: Request) {
  const g = await guard(req, { mutation: true }); if ("res" in g) return g.res;
  const body = await readBrainBody(req); if ("res" in body) return body.res;
  const p = Patch.safeParse(body.data); if (!p.success) return Response.json({ error: "Invalid workspace settings" }, { status: 400 });
  try { await updateWorkspaceProfile(g.owner, p.data); }
  catch (e) { if (e instanceof WorkspaceLimit) return Response.json({ error: e.message }, { status: 429 }); throw e; }
  return Response.json({ profile: await getWorkspaceProfile(g.owner) });
}
