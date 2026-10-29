import { env } from "@regie/server";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { github, safeNext, STATE_COOKIE } from "@/lib/github";
import { createSession, sessionCookie } from "@/lib/session";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest) {
  const fail = (e: string) => {
    const res = NextResponse.redirect(new URL(`/login?e=${e}`, req.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/auth/github" });
    return res;
  };
  const gh = github();
  if (!gh) return fail("config");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  if (!code || !state || !saved.state || !same(state, saved.state)) return fail("state");

  let login: string;
  try {
    const tokens = await gh.validateAuthorizationCode(code);
    const r = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokens.accessToken()}`, Accept: "application/vnd.github+json", "User-Agent": "regie" },
      cache: "no-store",
    });
    if (!r.ok) return fail("github");
    login = ((await r.json()) as { login?: string }).login ?? "";
  } catch {
    return fail("github");
  }
  // the GitHub token is not kept: it only served to learn who is signing in
  if (login.toLowerCase() !== env().OWNER_GITHUB_LOGIN.toLowerCase()) return fail("owner");

  const res = NextResponse.redirect(new URL(safeNext(saved.next), req.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/auth/github" });
  res.cookies.set(sessionCookie(await createSession(login)));
  return res;
}
