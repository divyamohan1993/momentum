import { z } from "zod";
import { guard } from "@/lib/auth";
import { readBrainBody } from "@/lib/brain-request";
import { SharedAction } from "@/lib/shared-types";
import { sharedList, sharedLists, mutateShared, SharedError } from "@/lib/shared-store";
import { WorkspaceLimit } from "@/lib/store";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof SharedError || e instanceof WorkspaceLimit) return Response.json({ error: e.message }, { status: e instanceof SharedError ? e.status : 429 });
  throw e;
}
export async function GET(req: Request) {
  const g = await guard(req); if ("res" in g) return g.res;
  const query = new URL(req.url).searchParams, id = query.get("id");
  if (id && !z.string().uuid().safeParse(id).success) return Response.json({ error: "Invalid list" }, { status: 400 });
  try { return Response.json(id ? await sharedList(g.user, id, query.has("version") ? Number(query.get("version")) : undefined) : { lists: await sharedLists(g.user), uid: g.user.uid }); }
  catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true }); if ("res" in g) return g.res;
  const body = await readBrainBody(req, 12_000); if ("res" in body) return body.res;
  const p = SharedAction.safeParse(body.data);
  if (!p.success) return Response.json({ error: "Invalid shared list request" }, { status: 400 });
  try { return Response.json(await mutateShared(g.user, p.data)); } catch (e) { return failure(e); }
}
