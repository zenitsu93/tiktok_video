import { env } from "@regie/server";
import { GitHub } from "arctic";

export function github(): GitHub | null {
  const e = env();
  if (!e.GITHUB_CLIENT_ID || !e.GITHUB_CLIENT_SECRET) return null;
  return new GitHub(e.GITHUB_CLIENT_ID, e.GITHUB_CLIENT_SECRET, new URL("/auth/github/callback", e.APP_URL).toString());
}

export const STATE_COOKIE = "regie_oauth_state";

/** Only a relative path inside the app, so the login can never bounce to another site. */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : "/";
}
