import { guard } from "@/lib/auth";
import { listActiveTasks, getVersion } from "@/lib/store";
import { unacknowledgedCount } from "@/lib/reminders";
import { rankTasks } from "@/lib/ranking";
import { brainEnabled, pushEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;

  const all = await listActiveTasks(g.owner);
  const visible = all.filter((t) => !t.archivedAt);
  const ranked = rankTasks(visible);
  const nextBest = ranked.find((t) => t.status === "todo" && !t.isBlocked)?.id ?? null;
  const [version, unacknowledged] = await Promise.all([getVersion(), unacknowledgedCount(g.owner)]);

  return Response.json({
    version,
    tasks: ranked,
    nextBest,
    unacknowledged,
    brain: brainEnabled(),
    push: pushEnabled(),
  });
}
