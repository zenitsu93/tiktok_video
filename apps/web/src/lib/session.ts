import { jwtVerify, SignJWT } from "jose";

/**
 * The session is a signed token in an httpOnly cookie. It holds the GitHub login
 * and nothing else; the server checks it on every request.
 */
export const SESSION_COOKIE = "regie_session";
const TTL = 60 * 60 * 24 * 30;

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET manquant ou trop court");
  return new TextEncoder().encode(s);
}

export async function createSession(login: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(login)
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .setAudience("regie")
    .sign(key());
}

/** Returns the login when the token is valid and belongs to the owner. */
export async function readSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], audience: "regie" });
    const owner = (process.env.OWNER_GITHUB_LOGIN ?? "zenitsu93").toLowerCase();
    return payload.sub && payload.sub.toLowerCase() === owner ? payload.sub : null;
  } catch {
    return null;
  }
}

export const sessionCookie = (value: string, maxAge = TTL) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
