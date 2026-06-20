import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/config";
import { fireAndChain } from "@/lib/reminders";
import { currentOwner, edgeOk } from "@/lib/auth";

export const dynamic = "force-dynamic";

const oauth = new OAuth2Client();

// Target of the per-reminder Cloud Task. OIDC-pinned (review B7): SA email + audience + verified.
async function oidcOk(req: Request): Promise<boolean> {
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

  let authed = await oidcOk(req);
  if (!authed) authed = !!(await currentOwner()); // owner can also trigger (tests/manual)
  if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { taskId?: unknown };
  if (typeof b.taskId !== "string") return Response.json({ error: "taskId required" }, { status: 400 });

  const result = await fireAndChain(env().ownerEmail, b.taskId);
  return Response.json({ ok: true, ...result });
}
