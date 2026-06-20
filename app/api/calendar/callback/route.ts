import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentOwner } from "@/lib/auth";
import { env } from "@/lib/config";
import { exchangeCode } from "@/lib/calendar";
import { setGoogleToken, audit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = env().appBaseUrl || req.url;
  if (!(await currentOwner())) return NextResponse.redirect(new URL("/login", base));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get("cal_state")?.value;
  if (!code || !state || state !== cookieState) return NextResponse.redirect(new URL("/?calendar=error", base));

  try {
    const refresh = await exchangeCode(code);
    if (refresh) {
      await setGoogleToken(refresh);
      await audit("calendar_connected", {});
      return NextResponse.redirect(new URL("/?calendar=connected", base));
    }
    return NextResponse.redirect(new URL("/?calendar=error", base));
  } catch {
    return NextResponse.redirect(new URL("/?calendar=error", base));
  }
}
