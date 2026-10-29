import { generateState } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { github, safeNext, STATE_COOKIE } from "@/lib/github";
import { appUrl } from "@/lib/http";

export async function GET(req: NextRequest) {
  const gh = github();
  if (!gh) return NextResponse.redirect(appUrl("/login?e=config"));
  const state = generateState();
  const url = gh.createAuthorizationURL(state, []);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: safeNext(req.nextUrl.searchParams.get("next")) }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/github",
    maxAge: 600,
  });
  return res;
}
