import { NextResponse, type NextRequest } from "next/server";
import { appUrl, fromApp } from "@/lib/http";
import { sessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  if (!fromApp(req)) return new NextResponse(null, { status: 403 });
  const res = NextResponse.redirect(appUrl("/login"), 303);
  res.cookies.set(sessionCookie("", 0));
  return res;
}
