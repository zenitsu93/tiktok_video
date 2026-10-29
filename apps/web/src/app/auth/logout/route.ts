import { NextResponse, type NextRequest } from "next/server";
import { sessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(sessionCookie("", 0));
  return res;
}
