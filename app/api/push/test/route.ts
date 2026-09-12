import { reserveWorkspaceWrite } from "@/lib/store";
import { guard } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

// Canary test-notification (§16.2): proves the one best-effort channel actually works
// before any task can be marked critical.
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  await reserveWorkspaceWrite(g.owner);
  const r = await sendPushToUser(g.owner, {
    kind: "test",
    title: "🎯 Momentum",
    body: "Notifications are live. You'll be nudged here when something needs you.",
    tag: "momentum-canary",
    renotify: true,
  });
  return Response.json({ ok: true, ...r });
}
