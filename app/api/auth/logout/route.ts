import { NextResponse } from "next/server";
import { clearCookie, edgeOk, originOk, revokeCurrentSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!edgeOk(req) || !originOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await revokeCurrentSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearCookie());
  res.cookies.set("momentum_session", "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
