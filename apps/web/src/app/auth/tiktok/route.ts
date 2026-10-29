import { tiktokAuthorizeUrl, tiktokConfigured } from "@regie/server";
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { appUrl, requireOwner } from "@/lib/http";
import { safeNext, TIKTOK_STATE } from "@/lib/github";

/** Sends the owner to TikTok to allow uploads to their inbox. /auth is public, so the session is checked here. */
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.redirect(appUrl("/login"));
  }
  const back = safeNext(req.nextUrl.searchParams.get("next"));
  if (!tiktokConfigured()) return NextResponse.redirect(appUrl(`${back}?tiktok=config`));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(tiktokAuthorizeUrl(state));
  res.cookies.set(TIKTOK_STATE, JSON.stringify({ state, next: back }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/tiktok",
    maxAge: 600,
  });
  return res;
}
