import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "./lib/session";

/**
 * First lock on every request: only the owner's session gets through, and each page
 * gets a fresh nonce for its Content-Security-Policy. Route handlers check the
 * session again, so a mistake here does not open the data.
 */
// /legal and the tiktok*.txt signature file are what the TikTok developer portal checks
const PUBLIC = [/^\/login$/, /^\/auth\//, /^\/manifest\.webmanifest$/, /^\/legal\/(conditions|confidentialite)$/, /^\/tiktok[A-Za-z0-9_-]*\.txt$/];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.some((r) => r.test(path));
  const login = isPublic ? null : await readSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !login) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
    const to = new URL("/login", req.url);
    if (path !== "/") to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  // the preview document sets its own, stricter policy
  if (path.startsWith("/api/")) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://github.com",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|vendor/|api/media/|favicon|apple-touch-icon|icon-|og\\.png|logo\\.svg).*)"],
};
