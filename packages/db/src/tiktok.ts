import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "./index";
import { tiktokAuth, tiktokSends, type TikTokSendStatus } from "./schema";

const OWNER = "owner";

export type TikTokAuthRow = typeof tiktokAuth.$inferSelect;

export async function getTikTokAuth(db: Db): Promise<TikTokAuthRow | undefined> {
  const [row] = await db.select().from(tiktokAuth).where(eq(tiktokAuth.id, OWNER));
  return row;
}

export async function saveTikTokAuth(db: Db, a: Omit<typeof tiktokAuth.$inferInsert, "id" | "updatedAt">) {
  const row = { ...a, id: OWNER, updatedAt: new Date() };
  await db.insert(tiktokAuth).values(row).onConflictDoUpdate({ target: tiktokAuth.id, set: row });
}

export async function deleteTikTokAuth(db: Db) {
  await db.delete(tiktokAuth).where(eq(tiktokAuth.id, OWNER));
}

export async function createTikTokSend(db: Db, videoId: string, renderAsset: string): Promise<string> {
  const [row] = await db.insert(tiktokSends).values({ videoId, renderAsset }).returning({ id: tiktokSends.id });
  return row!.id;
}

const MOVING: TikTokSendStatus[] = ["sending", "processing"];

/** A send left alone this long is over, whatever its line says (the worker follows it fifteen minutes). */
export const TIKTOK_SEND_TIMEOUT = 20 * 60_000;

/**
 * Moves a send along. Only a send still on its way changes: once cancelled (or timed out),
 * whatever the worker learns later does not bring it back. Says whether the line changed.
 */
export async function updateTikTokSend(db: Db, id: string, patch: { status: TikTokSendStatus; publishId?: string; error?: string | null }): Promise<boolean> {
  const rows = await db
    .update(tiktokSends)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(tiktokSends.id, id), inArray(tiktokSends.status, MOVING)))
    .returning({ id: tiktokSends.id });
  return rows.length > 0;
}

/** Still on its way (not cancelled, not timed out)? The worker asks before each step. */
export async function tiktokSendMoving(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ status: tiktokSends.status }).from(tiktokSends).where(eq(tiktokSends.id, id));
  return Boolean(row && MOVING.includes(row.status));
}

/** « Annuler l'envoi »: the video's sends still on their way stop here. Returns how many. */
export async function cancelTikTokSend(db: Db, videoId: string): Promise<number> {
  const rows = await db
    .update(tiktokSends)
    .set({ status: "cancelled", error: null, updatedAt: new Date() })
    .where(and(eq(tiktokSends.videoId, videoId), inArray(tiktokSends.status, MOVING)))
    .returning({ id: tiktokSends.id });
  return rows.length;
}

/**
 * Sends stuck on their way for over twenty minutes (worker restarted, job lost, TikTok
 * silent) are closed: a file still « sending » never reached TikTok, one « processing »
 * did and is probably in the inbox. Returns how many were closed.
 */
export async function expireTikTokSends(db: Db): Promise<number> {
  const before = new Date(Date.now() - TIKTOK_SEND_TIMEOUT);
  const lost = await db
    .update(tiktokSends)
    .set({ status: "error", error: "L'envoi ne s'est jamais terminé (le serveur a sans doute redémarré). Renvoie-la.", updatedAt: new Date() })
    .where(and(eq(tiktokSends.status, "sending"), lt(tiktokSends.updatedAt, before)))
    .returning({ id: tiktokSends.id });
  const silent = await db
    .update(tiktokSends)
    .set({ status: "unconfirmed", updatedAt: new Date() })
    .where(and(eq(tiktokSends.status, "processing"), lt(tiktokSends.updatedAt, before)))
    .returning({ id: tiktokSends.id });
  return lost.length + silent.length;
}

export async function lastTikTokSend(db: Db, videoId: string) {
  const [row] = await db.select().from(tiktokSends).where(eq(tiktokSends.videoId, videoId)).orderBy(desc(tiktokSends.createdAt)).limit(1);
  return row;
}

/** Sends still on their way: one per video at a time. */
export async function tiktokSendInFlight(db: Db, videoId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tiktokSends)
    .where(and(eq(tiktokSends.videoId, videoId), inArray(tiktokSends.status, MOVING), gt(tiktokSends.updatedAt, new Date(Date.now() - TIKTOK_SEND_TIMEOUT))));
  return (row?.n ?? 0) > 0;
}
