import { guard } from "@/lib/auth";
import { getWorkspaceProfile, listActiveTasks } from "@/lib/store";
import { tasksCsv, tasksCalendar } from "@/lib/data-portability";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(req); if ("res" in g) return g.res;
  const [profile, tasks] = await Promise.all([getWorkspaceProfile(g.owner), listActiveTasks(g.owner)]);
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  if (!["json", "csv", "ics"].includes(format)) return Response.json({ error: "Unsupported format" }, { status: 400 });
  const body = format === "csv" ? tasksCsv(tasks, profile.projects) : format === "ics" ? tasksCalendar(tasks) : JSON.stringify({ format: "momentum-backup", version: 1, exportedAt: new Date().toISOString(), timeZone: profile.timeZone, projects: profile.projects, tasks: tasks.map(({ ownerId: _, ...task }) => task) }, null, 2);
  return new Response(body, { headers: { "Content-Type": format === "json" ? "application/json" : format === "csv" ? "text/csv; charset=utf-8" : "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="momentum-${new Date().toISOString().slice(0, 10)}.${format}"`, "Cache-Control": "private, no-store" } });
}
