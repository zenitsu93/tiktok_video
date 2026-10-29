import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Media URLs carry an expiry and an HMAC instead of relying on the session cookie,
 * because the preview runs in a sandboxed frame with an opaque origin where the
 * browser does not send cookies. A link is only valid for one asset and a short time.
 */
const ID = /^[a-zA-Z0-9_-]{1,80}$/;

function mac(id: string, exp: number, secret: string) {
  return createHmac("sha256", secret).update(`${id}.${exp}`).digest("base64url");
}

export function signMedia(id: string, ttlSeconds = 3600, now = Date.now()): string {
  if (!ID.test(id)) throw new Error("invalid asset id");
  // rounded up to a 15-minute step so the same asset keeps the same URL between polls (no image reloads)
  const exp = Math.ceil((Math.floor(now / 1000) + ttlSeconds) / 900) * 900;
  return `/api/media/${id}?e=${exp}&s=${mac(id, exp, env().MEDIA_SECRET)}`;
}

export function verifyMedia(id: string, e: string | null, s: string | null, now = Date.now()): boolean {
  if (!ID.test(id) || !e || !s || !/^\d{1,12}$/.test(e)) return false;
  const exp = Number(e);
  if (exp * 1000 < now) return false;
  const want = Buffer.from(mac(id, exp, env().MEDIA_SECRET));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}
