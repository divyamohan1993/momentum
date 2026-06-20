import { NextResponse } from "next/server";
import { clearCookie, edgeOk, originOk } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!edgeOk(req)) return new NextResponse("forbidden", { status: 403 });
  if (!originOk(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  const c = clearCookie();
  res.cookies.set(c.name, c.value, {
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    path: c.path,
    maxAge: c.maxAge,
  });
  return res;
}
