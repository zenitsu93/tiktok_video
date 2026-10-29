import { getDb } from "@regie/db";
import { connectTikTok, TikTokError } from "@regie/server";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { safeNext, TIKTOK_STATE } from "@/lib/github";
import { requireOwner } from "@/lib/http";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** TikTok comes back here with a one-time code; the tokens are sealed and kept server-side. */
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(TIKTOK_STATE)?.value ?? "{}");
  } catch {}
  const back = safeNext(saved.next);
  const done = (result: string) => {
    const res = NextResponse.redirect(new URL(`${back}?tiktok=${result}`, req.url));
    res.cookies.delete({ name: TIKTOK_STATE, path: "/auth/tiktok" });
    return res;
  };
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const state = q.get("state");
  if (q.get("error")) return done("refus");
  if (!code || !state || !saved.state || !same(state, saved.state)) return done("state");
  try {
    const scope = await connectTikTok(getDb(), code);
    return done(scope.includes("video.upload") ? "ok" : "scope");
  } catch (e) {
    console.error("[tiktok] connexion :", e instanceof TikTokError ? e.code : e);
    return done("erreur");
  }
}
