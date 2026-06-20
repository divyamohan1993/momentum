import { verifyActionToken } from "@/lib/tokens";
import { setStatus, patchTask } from "@/lib/actions";
import { snooze } from "@/lib/reminders";
import { env } from "@/lib/config";
import { edgeOk } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Push notification action callback. Authenticated by the signed, task-bound action token
// (H4); the resulting state change is idempotent (a second tap finds the ladder already gone).
export async function POST(req: Request) {
  if (!edgeOk(req)) return new Response("forbidden", { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { taskId?: unknown; action?: unknown; token?: unknown };
  if (typeof b.taskId !== "string" || typeof b.token !== "string")
    return Response.json({ error: "bad request" }, { status: 400 });
  if (!(await verifyActionToken(b.token, b.taskId)))
    return Response.json({ error: "bad token" }, { status: 401 });

  const owner = env().ownerEmail;
  switch (b.action) {
    case "done":
      await setStatus(owner, b.taskId, "done");
      break;
    case "snooze":
      await snooze(owner, b.taskId);
      break;
    case "blocked":
      await patchTask(owner, b.taskId, { isBlocked: true });
      break;
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
