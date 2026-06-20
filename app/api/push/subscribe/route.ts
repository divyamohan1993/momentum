import { guard } from "@/lib/auth";
import { addPushSub } from "@/lib/store";
import { PushSub } from "@/lib/types";
import { nowUtcIso } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { subscription?: unknown; label?: unknown };
  const parsed = PushSub.safeParse({
    ...(b.subscription as object),
    createdAt: nowUtcIso(),
    label: typeof b.label === "string" ? b.label : undefined,
  });
  if (!parsed.success) return Response.json({ error: "invalid subscription" }, { status: 400 });
  await addPushSub(parsed.data);
  return Response.json({ ok: true });
}
