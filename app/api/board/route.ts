import { guard } from "@/lib/auth";
import { listActiveTasks, getVersion, brainOnline, getWorkspaceProfile, geminiUsage, listPushSubs } from "@/lib/store";
import { unacknowledgedCount } from "@/lib/reminders";
import { rankTasks } from "@/lib/ranking";
import { pushEnabled, calendarEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;

  const all = await listActiveTasks(g.owner);
  const visible = all;
  const ranked = rankTasks(visible);
  const nextBest = ranked.find((t) => t.status === "todo" && !t.isBlocked && !t.archivedAt)?.id ?? null;
  const [version, unacknowledged, brain] = await Promise.all([getVersion(g.owner), unacknowledgedCount(g.owner), brainOnline(g.owner)]);

  const [profile, usage, subscriptions] = await Promise.all([getWorkspaceProfile(g.owner), geminiUsage(g.owner), listPushSubs(g.owner)]);
  return Response.json({
    version,
    tasks: ranked,
    nextBest,
    unacknowledged,
    brain,
    push: pushEnabled(),
    calendar: calendarEnabled(),
    profile, usage, notificationsEnabled: subscriptions.some((s) => s.deviceHash === g.user.deviceHash),
  });
}
