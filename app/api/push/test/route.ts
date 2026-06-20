import { guard } from "@/lib/auth";
import { sendPushToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

// Canary test-notification (§16.2): proves the one best-effort channel actually works
// before any task can be marked critical.
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const r = await sendPushToAll({
    kind: "test",
    title: "🎯 Momentum",
    body: "Notifications are live. This is your alarm channel.",
    tag: "momentum-canary",
    renotify: true,
  });
  return Response.json({ ok: true, ...r });
}
