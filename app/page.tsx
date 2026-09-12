import { redirect } from "next/navigation";
import { currentIdentity } from "@/lib/auth";
import { listActiveTasks, getVersion, brainOnline, getWorkspaceProfile, geminiUsage, listPushSubs } from "@/lib/store";
import { unacknowledgedCount } from "@/lib/reminders";
import { rankTasks } from "@/lib/ranking";
import { pushEnabled, calendarEnabled } from "@/lib/config";
import Board from "@/components/board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const identity = await currentIdentity();
  if (!identity) redirect("/login");

  const owner = identity.owner;
  const all = (await listActiveTasks(owner));
  const tasks = rankTasks(all);
  const nextBest = tasks.find((t) => t.status === "todo" && !t.isBlocked && !t.archivedAt)?.id ?? null;
  const [version, unacknowledged, brain] = await Promise.all([getVersion(owner), unacknowledgedCount(owner), brainOnline(owner)]);

  const [profile, usage, subscriptions] = await Promise.all([getWorkspaceProfile(owner), geminiUsage(owner), listPushSubs(owner)]);
  return (
    <Board
      initial={{ version, tasks, nextBest, unacknowledged, brain, push: pushEnabled(), calendar: calendarEnabled(), profile, usage, notificationsEnabled: subscriptions.some((s) => s.deviceHash === identity.deviceHash) }}
    />
  );
}
