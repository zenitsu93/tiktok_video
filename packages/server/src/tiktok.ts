import { getTikTokAuth, saveTikTokAuth, type Db } from "@regie/db";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * TikTok, upload to inbox only: the export lands in the owner's TikTok inbox as a
 * draft, without music, and is published from the TikTok app once the song is added.
 * Scope video.upload; never video.publish. Tokens stay on the server, sealed.
 */
const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
export const TIKTOK_SCOPES = "user.info.basic,video.upload";

export class TikTokError extends Error {
  constructor(
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

/** What Thomas reads when TikTok says no. */
const MESSAGES: Record<string, string> = {
  access_token_invalid: "La connexion TikTok a expiré. Reconnecte TikTok.",
  scope_not_authorized: "TikTok n'a pas donné le droit d'envoyer des vidéos. Reconnecte TikTok et coche l'envoi de vidéos.",
  spam_risk_too_many_pending_share: "Cinq vidéos attendent déjà dans ta boîte TikTok. Publie-les ou supprime-les, puis réessaie.",
  spam_risk_user_banned_from_posting: "TikTok bloque les nouvelles publications sur ce compte pour le moment.",
  rate_limit_exceeded: "Trop d'envois d'un coup. Réessaie dans une minute.",
  invalid_grant: "La connexion TikTok n'est plus valable. Reconnecte TikTok.",
};
const explain = (code: string, fallback?: string) => MESSAGES[code] ?? `TikTok a refusé l'envoi (${fallback || code}).`;

export function tiktokConfigured(): boolean {
  const e = env();
  return Boolean(e.TIKTOK_CLIENT_KEY && e.TIKTOK_CLIENT_SECRET);
}

export const tiktokRedirect = () => new URL("/auth/tiktok/callback", env().APP_URL).toString();

export function tiktokAuthorizeUrl(state: string): string {
  const u = new URL(AUTHORIZE);
  u.searchParams.set("client_key", env().TIKTOK_CLIENT_KEY ?? "");
  u.searchParams.set("scope", TIKTOK_SCOPES);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", tiktokRedirect());
  u.searchParams.set("state", state);
  return u.toString();
}

// ---- sealing: the tokens are useless to someone who only reads the database

const sealKey = () => Buffer.from(hkdfSync("sha256", env().MEDIA_SECRET, "regie", "tiktok-tokens", 32));

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sealKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

export function unseal(sealed: string): string {
  const raw = Buffer.from(sealed, "base64url");
  const d = createDecipheriv("aes-256-gcm", sealKey(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

// ---- tokens

interface TokenResponse {
  open_id?: string;
  scope?: string;
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenCall(params: Record<string, string>): Promise<TokenResponse & { access_token: string; refresh_token: string }> {
  const e = env();
  const r = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({ client_key: e.TIKTOK_CLIENT_KEY ?? "", client_secret: e.TIKTOK_CLIENT_SECRET ?? "", ...params }),
  });
  const j = (await r.json().catch(() => ({}))) as TokenResponse;
  if (!r.ok || j.error || !j.access_token || !j.refresh_token) throw new TikTokError(explain(j.error ?? "invalid_grant", j.error_description), j.error);
  return j as TokenResponse & { access_token: string; refresh_token: string };
}

async function store(db: Db, t: TokenResponse & { access_token: string; refresh_token: string }) {
  const now = Date.now();
  await saveTikTokAuth(db, {
    openId: t.open_id ?? "",
    scope: t.scope ?? "",
    accessToken: seal(t.access_token),
    refreshToken: seal(t.refresh_token),
    expiresAt: new Date(now + (t.expires_in ?? 86_400) * 1000),
    refreshExpiresAt: new Date(now + (t.refresh_expires_in ?? 31_536_000) * 1000),
  });
  return t.scope ?? "";
}

/** After the owner accepted on TikTok: keeps the tokens, returns the scopes granted. */
export async function connectTikTok(db: Db, code: string): Promise<string> {
  return store(db, await tokenCall({ code, grant_type: "authorization_code", redirect_uri: tiktokRedirect() }));
}

/** A usable access token, refreshed when it has under five minutes left. */
export async function tiktokAccessToken(db: Db): Promise<string> {
  const a = await getTikTokAuth(db);
  if (!a || a.refreshExpiresAt.getTime() < Date.now()) throw new TikTokError("Connecte d'abord ton compte TikTok.", "not_connected");
  if (a.expiresAt.getTime() - Date.now() > 5 * 60_000) return unseal(a.accessToken);
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: unseal(a.refreshToken) });
  await store(db, t);
  return t.access_token;
}

export async function tiktokConnected(db: Db): Promise<boolean> {
  const a = await getTikTokAuth(db);
  return Boolean(a && a.refreshExpiresAt.getTime() > Date.now() && a.scope.includes("video.upload"));
}

// ---- upload

const MB = 1024 * 1024;

/**
 * TikTok's chunk rules: one chunk up to 64 MB (and always one under 5 MB); above
 * that, chunks of 5 to 64 MB with the last one taking the remainder (up to 128 MB).
 */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 32 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

async function api<T>(path: string, token: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
    // a call that hangs held the queue: every later send stayed « Envoi… » behind it
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  const code = j.error?.code ?? (r.ok ? "ok" : `http_${r.status}`);
  if (code !== "ok" || !j.data) throw new TikTokError(explain(code, j.error?.message), code);
  return j.data;
}

/** Sends the MP4 to the inbox and returns TikTok's publish id. */
export async function uploadToInbox(token: string, video: Buffer): Promise<string> {
  const { chunkSize, count } = chunkPlan(video.length);
  const init = await api<{ publish_id: string; upload_url: string }>("/post/publish/inbox/video/init/", token, {
    source_info: { source: "FILE_UPLOAD", video_size: video.length, chunk_size: chunkSize, total_chunk_count: count },
  });
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? video.length : start + chunkSize;
    const r = await fetch(init.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${video.length}` },
      body: new Uint8Array(video.subarray(start, end)),
      signal: AbortSignal.timeout(5 * 60_000),
    }).catch((e: Error) => {
      throw new TikTokError(e.name === "TimeoutError" ? "TikTok n'a pas reçu le fichier en 5 minutes. Réessaie." : "L'envoi du fichier à TikTok a été coupé. Réessaie.", "upload_timeout");
    });
    if (r.status !== 201 && r.status !== 206 && !r.ok) throw new TikTokError(`L'envoi du fichier à TikTok a échoué (HTTP ${r.status}).`, `upload_${r.status}`);
  }
  return init.publish_id;
}

/** PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX, PUBLISH_COMPLETE or FAILED. */
export async function tiktokPublishStatus(token: string, publishId: string): Promise<{ status: string; failReason?: string }> {
  const d = await api<{ status: string; fail_reason?: string }>("/post/publish/status/fetch/", token, { publish_id: publishId });
  return { status: d.status, failReason: d.fail_reason };
}
