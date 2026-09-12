import { NextResponse } from "next/server";
import { edgeOk, originOk, loginRateOk } from "@/lib/auth";
import { env } from "@/lib/config";
import { createLoginProof } from "@/lib/login-proof";
import { LOGIN_COOKIE, LOGIN_SECONDS } from "@/lib/auth-policy";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!edgeOk(req) || !originOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!loginRateOk()) return NextResponse.json({ error: "Try again shortly" }, { status: 429 });
  const proof = createLoginProof(env().sessionSecret);
  const res = NextResponse.json({ csrf: proof.nonce }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(LOGIN_COOKIE, proof.cookie, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: LOGIN_SECONDS });
  return res;
}
