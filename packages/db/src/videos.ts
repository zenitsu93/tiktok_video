import type { VideoDoc } from "@regie/core";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "./index";
import { assets, sceneRenders, usage, videos, videoVersions, type Progress, type VideoStatus } from "./schema";

export type VideoRow = typeof videos.$inferSelect;

export async function createVideo(db: Db, doc: VideoDoc): Promise<VideoRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(videos).values({ title: doc.title, artist: doc.artist, doc }).returning();
    await tx.insert(videoVersions).values({ videoId: row!.id, version: 1, doc, reason: "création" });
    return row!;
  });
}

export async function getVideo(db: Db, id: string): Promise<VideoRow | undefined> {
  const [row] = await db.select().from(videos).where(eq(videos.id, id));
  return row;
}

export async function listVideos(db: Db, limit = 30) {
  return db
    .select({ id: videos.id, title: videos.title, artist: videos.artist, status: videos.status, updatedAt: videos.updatedAt, renderAsset: videos.renderAsset })
    .from(videos)
    .orderBy(desc(videos.updatedAt))
    .limit(limit);
}

/**
 * Changes a video's document under a row lock, so the app and the worker never
 * overwrite each other's edits, and keeps the previous state for undo.
 */
export async function mutateDoc(
  db: Db,
  id: string,
  reason: string,
  fn: (doc: VideoDoc, row: VideoRow) => VideoDoc | Promise<VideoDoc>,
): Promise<VideoRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(videos).where(eq(videos.id, id)).for("update");
    if (!row) throw new Error(`video ${id} not found`);
    const doc = await fn(row.doc, row);
    const version = row.version + 1;
    await tx.insert(videoVersions).values({ videoId: id, version, doc, reason });
    const [next] = await tx
      .update(videos)
      .set({ doc, version, title: doc.title, artist: doc.artist, updatedAt: new Date() })
      .where(eq(videos.id, id))
      .returning();
    return next!;
  });
}

/** Restores the state before the latest edit (as a new version, so redo is just another undo). */
export async function undo(db: Db, id: string): Promise<VideoRow | undefined> {
  const row = await getVideo(db, id);
  if (!row || row.version <= 1) return row;
  const [prev] = await db
    .select()
    .from(videoVersions)
    .where(and(eq(videoVersions.videoId, id), lt(videoVersions.version, row.version)))
    .orderBy(desc(videoVersions.version))
    .limit(1);
  if (!prev) return row;
  return mutateDoc(db, id, `annuler (retour à la version ${prev.version})`, () => prev.doc);
}

export async function setStatus(db: Db, id: string, status: VideoStatus, progress: Progress | null = null, error: string | null = null) {
  await db.update(videos).set({ status, progress, error, updatedAt: new Date() }).where(eq(videos.id, id));
}

export async function setProgress(db: Db, id: string, progress: Progress) {
  await db.update(videos).set({ progress }).where(eq(videos.id, id));
}

export async function setBusy(db: Db, id: string, beatId: string, busy: boolean) {
  const expr = busy
    ? sql`(SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM jsonb_array_elements_text(${videos.busyBeats} || ${JSON.stringify([beatId])}::jsonb) AS x)`
    : sql`(SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(${videos.busyBeats}) AS x WHERE x <> ${beatId})`;
  await db.update(videos).set({ busyBeats: expr }).where(eq(videos.id, id));
}

export async function setRendered(db: Db, id: string, renderAsset: string, scenes: string[]) {
  await db.update(videos).set({ renderAsset, renderedScenes: scenes, updatedAt: new Date() }).where(eq(videos.id, id));
}

export async function deleteVideo(db: Db, id: string) {
  await db.delete(videos).where(eq(videos.id, id));
}

// ---- assets and render cache

export async function saveAsset(db: Db, a: typeof assets.$inferInsert) {
  await db.insert(assets).values(a).onConflictDoNothing();
}

export async function getAsset(db: Db, id: string) {
  const [a] = await db.select().from(assets).where(eq(assets.id, id));
  return a;
}

export async function getSceneRender(db: Db, hash: string) {
  const [r] = await db.select().from(sceneRenders).where(eq(sceneRenders.hash, hash));
  return r;
}

export async function saveSceneRender(db: Db, hash: string, storageKey: string) {
  await db.insert(sceneRenders).values({ hash, storageKey }).onConflictDoNothing();
}

// ---- spending

export async function recordUsage(db: Db, u: typeof usage.$inferInsert) {
  await db.insert(usage).values(u);
}

export async function spentSince(db: Db, since: Date): Promise<number> {
  const [r] = await db
    .select({ total: sql<string>`COALESCE(SUM(${usage.costUsd}), 0)` })
    .from(usage)
    .where(gte(usage.createdAt, since));
  return Number(r?.total ?? 0);
}

export async function videoCosts(db: Db, videoId: string) {
  return db
    .select({
      provider: usage.provider,
      operation: usage.operation,
      calls: sql<number>`COUNT(*)::int`,
      cost: sql<string>`COALESCE(SUM(${usage.costUsd}), 0)`,
    })
    .from(usage)
    .where(eq(usage.videoId, videoId))
    .groupBy(usage.provider, usage.operation);
}

export async function setError(db: Db, id: string, error: string | null) {
  await db.update(videos).set({ error }).where(eq(videos.id, id));
}
