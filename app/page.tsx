import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth";
import { listActiveTasks, getVersion } from "@/lib/store";
import { unacknowledgedCount } from "@/lib/reminders";
import { rankTasks } from "@/lib/ranking";
import { brainEnabled, pushEnabled, calendarEnabled } from "@/lib/config";
import Board from "@/components/board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const owner = await currentOwner();
  if (!owner) redirect("/login");

  const all = (await listActiveTasks(owner)).filter((t) => !t.archivedAt);
  const tasks = rankTasks(all);
  const nextBest = tasks.find((t) => t.status === "todo" && !t.isBlocked)?.id ?? null;
  const [version, unacknowledged] = await Promise.all([getVersion(), unacknowledgedCount(owner)]);

  return (
    <Board
      initial={{ version, tasks, nextBest, unacknowledged, brain: brainEnabled(), push: pushEnabled(), calendar: calendarEnabled() }}
    />
  );
}
