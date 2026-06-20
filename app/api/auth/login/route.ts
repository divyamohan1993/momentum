import { NextResponse } from "next/server";
import { attemptLogin, signSession, sessionCookie, getIp, edgeOk, originOk } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!edgeOk(req)) return new NextResponse("forbidden", { status: 403 });
  if (!originOk(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { passphrase?: unknown };
  if (typeof body.passphrase !== "string" || !body.passphrase)
    return NextResponse.json({ error: "passphrase required" }, { status: 400 });

  const r = await attemptLogin(body.passphrase, getIp(req));
  if (!r.ok)
    return NextResponse.json(
      { error: r.reason ?? "denied", retryAfter: r.retryAfter },
      { status: r.reason === "invalid" ? 401 : 429 },
    );

  const token = await signSession();
  const res = NextResponse.json({ ok: true });
  const c = sessionCookie(token);
  res.cookies.set(c.name, c.value, {
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    path: c.path,
    maxAge: c.maxAge,
  });
  return res;
}
