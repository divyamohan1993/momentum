import { verifyActionToken } from "@/lib/tokens";
import { setStatus, patchTask } from "@/lib/actions";
import { snooze } from "@/lib/reminders";
import { env } from "@/lib/config";
import { getTask } from "@/lib/store";
import { readBrainBody } from "@/lib/brain-request";
import { edgeOk, deviceMayAct } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Push notification action callback. Authenticated by the signed, task-bound action token
// (H4); the resulting state change is idempotent (a second tap finds the ladder already gone).
export async function POST(req: Request) {
  if (!edgeOk(req)) return new Response("forbidden", { status: 403 });
  const body = await readBrainBody(req);
  if ("res" in body) return body.res;
  const b = body.data;
  if (typeof b.taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.taskId) || typeof b.token !== "string" || b.token.length > 2048)
    return Response.json({ error: "bad request" }, { status: 400 });
  const owner = await verifyActionToken(b.token, b.taskId);
  if (!owner || !(await deviceMayAct(owner)))
    return Response.json({ error: "bad token" }, { status: 401 });

  if (!(await getTask(owner, b.taskId))) return Response.json({ error: "not found" }, { status: 404 });
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
