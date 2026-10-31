import type { VideoDoc } from "@regie/core";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
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
    .select({
      id: videos.id,
      title: videos.title,
      artist: videos.artist,
      status: videos.status,
      progress: videos.progress,
      updatedAt: videos.updatedAt,
      renderAsset: videos.renderAsset,
      caption: sql<string | null>`${videos.doc}->>'caption'`,
    })
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

/** Videos nobody has touched for `days` days; one a job is working on stays. */
export async function staleVideos(db: Db, days: number): Promise<string[]> {
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(lt(videos.updatedAt, sql`now() - make_interval(days => ${days})`), sql`${videos.status} not in ('generating', 'rendering')`));
  return rows.map((r) => r.id);
}

/**
 * Deletes a video for good: its row and saved versions, then the files nothing points
 * to any more (its images, voice clips and exports, the scene clips of its last export).
 * Returns their storage keys for the caller to remove. Usage rows stay, so the spend
 * history and the daily budget still count what this video cost.
 */
export async function deleteVideo(db: Db, id: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ render: videos.renderAsset, scenes: videos.renderedScenes }).from(videos).where(eq(videos.id, id));
    if (!row) return [];
    const own = await tx.execute<{ id: string }>(sql`
      select jsonb_object_keys(doc->'assets') as id from ${videos} where ${videos.id} = ${id}
      union select jsonb_object_keys(doc->'assets') from ${videoVersions} where ${videoVersions.videoId} = ${id}`);
    const ownIds = [...own.map((r) => r.id), ...(row.render ? [row.render] : [])];
    await tx.delete(videos).where(eq(videos.id, id));

    // anything a video, one of its versions or its last export still uses stays
    const used = sql`(
      select jsonb_object_keys(doc->'assets') from ${videos}
      union select jsonb_object_keys(doc->'assets') from ${videoVersions}
      union select render_asset from ${videos} where render_asset is not null)`;
    // other orphans (older exports, leftovers) wait an hour, so a file being stored right now is never taken
    const old = lt(assets.createdAt, sql`now() - interval '1 hour'`);
    const files = await tx
      .delete(assets)
      .where(and(sql`${assets.id} not in ${used}`, ownIds.length ? or(inArray(assets.id, ownIds), old) : old))
      .returning({ key: assets.storageKey });
    // its last export's scenes, and every scene made for it (ahead of time, or for an older export)
    const mine = row.scenes.length ? or(inArray(sceneRenders.hash, row.scenes), eq(sceneRenders.videoId, id)) : eq(sceneRenders.videoId, id);
    const scenes = await tx
      .delete(sceneRenders)
      .where(and(mine, sql`not exists (select 1 from ${videos} where ${videos.renderedScenes} ? ${sceneRenders.hash})`))
      .returning({ key: sceneRenders.storageKey });
    return [...files, ...scenes].map((f) => f.key);
  });
}

/**
 * Scene clips no video uses any more: made for a video since deleted (or before scenes knew
 * their video), and in no video's last export. A day old at least, so a render in progress is never taken.
 */
export async function deleteOrphanScenes(db: Db): Promise<string[]> {
  const rows = await db
    .delete(sceneRenders)
    .where(
      and(
        lt(sceneRenders.createdAt, sql`now() - interval '1 day'`),
        sql`(${sceneRenders.videoId} is null or not exists (select 1 from ${videos} where ${videos.id} = ${sceneRenders.videoId}))`,
        sql`not exists (select 1 from ${videos} where ${videos.renderedScenes} ? ${sceneRenders.hash})`,
      ),
    )
    .returning({ key: sceneRenders.storageKey });
  return rows.map((r) => r.key);
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

export async function saveSceneRender(db: Db, hash: string, storageKey: string, videoId: string) {
  await db.insert(sceneRenders).values({ hash, storageKey, videoId }).onConflictDoNothing();
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

/** Spending per UTC day and service since a date, for the "Conso" page (UTC days, like the daily budget). */
export async function usageByDay(db: Db, since: Date) {
  const day = sql<string>`to_char(${usage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  return db
    .select({ day, provider: usage.provider, calls: sql<number>`COUNT(*)::int`, cost: sql<string>`COALESCE(SUM(${usage.costUsd}), 0)` })
    .from(usage)
    .where(gte(usage.createdAt, since))
    .groupBy(day, usage.provider);
}

/** Spending per video and service since a date. Rows of deleted videos come back with a null id. */
export async function usageByVideo(db: Db, since: Date) {
  return db
    .select({
      videoId: usage.videoId,
      title: videos.title,
      artist: videos.artist,
      provider: usage.provider,
      calls: sql<number>`COUNT(*)::int`,
      cost: sql<string>`COALESCE(SUM(${usage.costUsd}), 0)`,
      last: sql<string>`MAX(${usage.createdAt})`,
    })
    .from(usage)
    .leftJoin(videos, eq(videos.id, usage.videoId))
    .where(gte(usage.createdAt, since))
    .groupBy(usage.videoId, videos.title, videos.artist, usage.provider);
}

export async function setError(db: Db, id: string, error: string | null) {
  await db.update(videos).set({ error }).where(eq(videos.id, id));
}
