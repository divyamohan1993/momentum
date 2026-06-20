import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Page-navigation guard for UX redirects only. API routes self-guard via lib/auth#guard
 * (which also checks revocation against Firestore). This edge middleware does a light
 * signature/exp check (no Firestore — firebase-admin can't run at the edge).
 */
const PUBLIC_PAGES = new Set(["/login"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes, static assets, PWA files → let through (self-guarded or public).
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/icon") || // /icon.svg
    pathname.startsWith("/apple-icon") ||
    pathname === "/favicon.ico" ||
    /\.(svg|png|ico|jpg|jpeg|webp|gif)$/.test(pathname) // any image asset (favicons, icons)
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next();

  const token = req.cookies.get("momentum_session")?.value;
  let ok = false;
  const secret = process.env.SESSION_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
