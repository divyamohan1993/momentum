import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { currentOwner } from "@/lib/auth";
import { calendarEnabled, env } from "@/lib/config";
import { authUrl } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await currentOwner())) return NextResponse.redirect(new URL("/login", env().appBaseUrl || req.url));
  if (!calendarEnabled()) return NextResponse.redirect(new URL("/?calendar=disabled", env().appBaseUrl || req.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("cal_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
