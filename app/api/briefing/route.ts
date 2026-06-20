import { guard } from "@/lib/auth";
import { briefing } from "@/lib/brain";
import { listActiveTasks } from "@/lib/store";
import { formatIst } from "@/lib/time";

export const dynamic = "force-dynamic";

// Weekly chief-of-staff briefing from the current board.
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;

  const all = await listActiveTasks(g.owner);
  const now = Date.now();
  const doneRecent = all.filter((t) => t.status === "done" && t.completedAt && now - new Date(t.completedAt).getTime() < 7 * 86_400_000);
  const open = all.filter((t) => !t.archivedAt && t.status !== "done");

  const summary =
    `DONE in the last 7 days (${doneRecent.length}):\n` +
    (doneRecent.map((t) => `- ${t.title}`).join("\n") || "(none)") +
    `\n\nOPEN (${open.length}):\n` +
    (open
      .map(
        (t) =>
          `- ${t.title} [${t.status}${t.dueAt ? ", due " + formatIst(t.dueAt) : ""}${t.isBlocked ? ", blocked" : ""}${t.priority !== "med" ? ", " + t.priority : ""}]`,
      )
      .join("\n") || "(none)");

  const { result, degraded } = await briefing(summary);
  return Response.json({ ...result, degraded });
}
