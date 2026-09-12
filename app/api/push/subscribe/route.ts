import { allowedPushEndpoint } from "@/lib/workspace-policy";
import { readBrainBody } from "@/lib/brain-request";
import { guard } from "@/lib/auth";
import { addPushSub, removeDevicePushSubs, reserveWorkspaceWrite } from "@/lib/store";
import { PushSub } from "@/lib/types";
import { nowUtcIso } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const body = await readBrainBody(req);
  if ("res" in body) return body.res;
  const b = body.data;
  const parsed = PushSub.safeParse({
    ...(b.subscription as object),
    createdAt: nowUtcIso(),
    label: typeof b.label === "string" ? b.label : undefined,
  });
  if (!parsed.success || !allowedPushEndpoint(parsed.data.endpoint)) return Response.json({ error: "invalid subscription" }, { status: 400 });
  await reserveWorkspaceWrite(g.owner);
  await addPushSub(g.owner, parsed.data, g.user.deviceHash);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await guard(req, { mutation: true }); if ("res" in g) return g.res;
  await removeDevicePushSubs(g.owner, g.user.deviceHash);
  return Response.json({ ok: true });
}
