import { and, desc, eq, gt, sql } from "drizzle-orm";
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

export async function updateTikTokSend(db: Db, id: string, patch: { status: TikTokSendStatus; publishId?: string; error?: string | null }) {
  await db
    .update(tiktokSends)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tiktokSends.id, id));
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
    .where(and(eq(tiktokSends.videoId, videoId), eq(tiktokSends.status, "sending"), gt(tiktokSends.updatedAt, new Date(Date.now() - 15 * 60_000))));
  return (row?.n ?? 0) > 0;
}
