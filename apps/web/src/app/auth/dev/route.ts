import { env } from "@regie/server";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl, fromApp } from "@/lib/http";
import { createSession, sessionCookie } from "@/lib/session";

/** Local sign-in without GitHub. Off unless DEV_LOGIN=1, and env() refuses that flag in production. */
export async function POST(req: NextRequest) {
  const e = env();
  if (e.DEV_LOGIN !== "1" || e.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  if (!fromApp(req)) return new NextResponse(null, { status: 403 });
  const res = NextResponse.redirect(appUrl("/"), 303);
  res.cookies.set(sessionCookie(await createSession(e.OWNER_GITHUB_LOGIN)));
  return res;
}
