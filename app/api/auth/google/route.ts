import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createGoogleSession, edgeOk, originOk, loginRateOk, sessionCookie } from "@/lib/auth";
import { env } from "@/lib/config";
import { LOGIN_COOKIE, DEVICE_COOKIE } from "@/lib/auth-policy";
import { verifyLoginProof } from "@/lib/login-proof";
import { readBrainBody } from "@/lib/brain-request";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!edgeOk(req) || !originOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!loginRateOk()) return NextResponse.json({ error: "Try again shortly" }, { status: 429 });
  const body = await readBrainBody(req);
  if ("res" in body) return body.res;
  const { idToken, csrf, timeZone } = body.data;
  const proof = (await cookies()).get(LOGIN_COOKIE)?.value;
  if (!verifyLoginProof(proof, csrf, env().sessionSecret)) return NextResponse.json({ error: "Restart Google sign-in" }, { status: 403 });
  let res: NextResponse;
  try {
    if (typeof idToken !== "string" || idToken.length > 8000 || idToken.length < 100) throw new Error("invalid credential");
    const session = await createGoogleSession(idToken, typeof timeZone === "string" ? timeZone : undefined);
    res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(sessionCookie(session.token));
    res.cookies.set(DEVICE_COOKIE, session.device, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 180 * 86400 });
    res.cookies.set("momentum_session", "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const known = new Set(["access denied", "Legacy identity mismatch", "Sign-in used or limited", "Workspace identity mismatch"]);
      const reason = error instanceof Error && known.has(error.message) ? error.message : String((error as { code?: unknown }).code ?? "internal");
      console.warn(JSON.stringify({ event: "login_diagnostic", reason, type: error instanceof Error ? error.name : "unknown", frames: error instanceof Error ? error.stack?.split("\n").slice(1, 3) : [] }));
    }
    // Don't log ID tokens, provider errors, account details or cookies.
    console.warn(JSON.stringify({ severity: "WARNING", event: "google_login_denied" }));
    res = NextResponse.json({ error: "Sign-in denied. Use a verified Google account and try again." }, { status: 401 });
  }
  res.cookies.set(LOGIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
