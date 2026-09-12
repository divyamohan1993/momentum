import { OAuth2Client } from "google-auth-library";
import { getTask, coll } from "@/lib/store";
import { readBrainBody } from "@/lib/brain-request";
import { env } from "@/lib/config";
import { fireAndChain } from "@/lib/reminders";
import { currentOwner, edgeOk, originOk } from "@/lib/auth";

export const dynamic = "force-dynamic";

const oauth = new OAuth2Client();

// Target of the per-reminder Cloud Task. OIDC-pinned (review B7): SA email + audience + verified.
async function oidcOk(req: Request): Promise<boolean> {
  if (!env().appBaseUrl || !env().sweepInvokerSa || !env().sweepAudience) return false;
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  try {
    const ticket = await oauth.verifyIdToken({
      idToken: m[1]!,
      audience: env().appBaseUrl ? `${env().appBaseUrl}/api/fire` : undefined,
    });
    const p = ticket.getPayload();
    if (!p || !p.email_verified) return false;
    if (env().sweepInvokerSa && p.email !== env().sweepInvokerSa) return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!edgeOk(req)) return new Response("forbidden", { status: 403 });

  const internal = await oidcOk(req);
  const userOwner = originOk(req) ? await currentOwner() : null;
  if (!internal && !userOwner) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await readBrainBody(req);
  if ("res" in body) return body.res;
  const taskId = body.data.taskId;
  if (typeof taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(taskId)) return Response.json({ error: "Invalid taskId" }, { status: 400 });
  // Only the trusted task worker may resolve an owner from the stored task.
  const owner = internal ? (await coll("tasks").doc(taskId).get()).data()?.ownerId : userOwner;
  if (typeof owner !== "string" || !(await getTask(owner, taskId))) return internal ? Response.json({ ok: true, rescheduled: false }) : Response.json({ error: "not found" }, { status: 404 });
  const result = await fireAndChain(owner, taskId);
  return Response.json({ ok: true, ...result });
}
