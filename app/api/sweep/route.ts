import { OAuth2Client } from "google-auth-library";
import { currentOwner, edgeOk } from "@/lib/auth";
import { env } from "@/lib/config";
import { sweep } from "@/lib/reminders";
import { archiveOldDone } from "@/lib/store";

export const dynamic = "force-dynamic";

const oauth = new OAuth2Client();

// Full OIDC claim pinning (review B7): signature, iss (Google lib), aud, SA email, email_verified, exp.
async function oidcOk(req: Request): Promise<boolean> {
  const h = req.headers.get("authorization") ?? "";
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

  let authed = await oidcOk(req);
  if (!authed) authed = !!(await currentOwner());
  if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });

  const owner = env().ownerEmail;
  const result = await sweep(owner);
  const archived = await archiveOldDone(owner);
  return Response.json({ ok: true, ...result, archived });
}
