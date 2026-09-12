import { OAuth2Client } from "google-auth-library";
import { currentOwner, edgeOk, originOk } from "@/lib/auth";
import { env } from "@/lib/config";
import { sweep } from "@/lib/reminders";
import { archiveOldDone, coll } from "@/lib/store";

export const dynamic = "force-dynamic";

const oauth = new OAuth2Client();

// Full OIDC claim pinning (review B7): signature, iss (Google lib), aud, SA email, email_verified, exp.
async function oidcOk(req: Request): Promise<boolean> {
  const h = req.headers.get("authorization") ?? "";
  if (!env().appBaseUrl || !env().sweepInvokerSa || !env().sweepAudience) return false;
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) return false;
  try {
    const ticket = await oauth.verifyIdToken({
      idToken: m[1]!,
      audience: env().sweepAudience || undefined,
    });
    const p = ticket.getPayload();
    if (!p) return false;
    if (env().sweepInvokerSa && p.email !== env().sweepInvokerSa) return false;
    if (!p.email_verified) return false;
    return true;
  } catch {
    return false;
  }
}

// The 1-minute Cloud Scheduler sweep (D4). Gemini-free. Callable by the scheduler SA (OIDC)
// or a live owner session (for tests/manual runs).
export async function POST(req: Request) {
  if (!edgeOk(req)) return new Response("forbidden", { status: 403 });

  const internal = await oidcOk(req);
  const owner = originOk(req) ? await currentOwner() : null;
  if (!internal && !owner) return Response.json({ error: "unauthorized" }, { status: 401 });
  const owners: string[] = owner && !internal ? [owner] : [...new Set((await coll("reminders").where("active", "==", true).limit(100).get()).docs.map((d) => d.data().ownerId as string))];
  let fired = 0, rescheduled = 0, archived = 0;
  for (const workspace of owners) {
    const r = await sweep(workspace); fired += r.fired; rescheduled += r.rescheduled;
    archived += await archiveOldDone(workspace);
  }
  return Response.json({ ok: true, fired, rescheduled, archived });
}
