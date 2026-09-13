import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth-policy";

/** Presence-only navigation hint. Every protected page/API verifies its session server-side. */
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://apis.google.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
    "frame-src https://dmjone.firebaseapp.com", "worker-src 'self' blob:", "manifest-src 'self'",
    "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join("; ");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const isPublic = pathname === "/login" || pathname === "/shared" || pathname.startsWith("/api/") || pathname.startsWith("/_next/")
    || pathname === "/sw.js" || pathname === "/manifest.webmanifest" || /\.(svg|png|ico|jpg|jpeg|webp|gif)$/.test(pathname)
    || pathname.startsWith("/icons") || pathname.startsWith("/apple-icon");
  // Browser entry points use one cookie origin; Cloud Tasks keep their existing API URLs.
  const canonical = process.env.APP_ORIGIN || "https://momentum.dmj.one";
  const redirectToCanonical = !pathname.startsWith("/api/") && !pathname.startsWith("/_next/")
    && req.headers.get("host") !== new URL(canonical).host;
  const canonicalTarget = new URL(canonical);
  canonicalTarget.pathname = req.nextUrl.pathname;
  canonicalTarget.search = req.nextUrl.search;
  const res = redirectToCanonical
    ? NextResponse.redirect(canonicalTarget)
    : !isPublic && !req.cookies.get(SESSION_COOKIE)?.value
    ? NextResponse.redirect(new URL("/login", req.url))
    : NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (!pathname.startsWith("/_next/") && pathname !== "/sw.js") res.headers.set("Cache-Control", "private, no-store");
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
