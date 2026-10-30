import type { Asset } from "@regie/core";
import { desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./index";
import { assets, library, videos, videoVersions } from "./schema";

export type LibraryRow = typeof library.$inferSelect;

export interface Keep {
  assetId: string;
  words: string;
  text: string;
  label: string;
  files: Asset[];
  cut: boolean;
}

/**
 * Puts pictures in the library, or marks them used again. A picture kept for a second idea
 * adds that idea's words, so it is found by both.
 */
export async function keepInLibrary(db: Db, videoId: string, items: Keep[]) {
  // one picture on several shots: one entry with every shot's words
  const byId = new Map<string, Keep>();
  for (const it of items) {
    const prev = byId.get(it.assetId);
    byId.set(it.assetId, prev ? { ...prev, words: `${prev.words} ${it.words}`, text: join(prev.text, it.text), files: merge(prev.files, it.files) } : it);
  }
  if (!byId.size) return;
  await db.transaction(async (tx) => {
    const old = new Map((await tx.select().from(library).where(inArray(library.assetId, [...byId.keys()])).for("update")).map((r) => [r.assetId, r]));
    for (const it of byId.values()) {
      const prev = old.get(it.assetId);
      const words = [...new Set(`${prev?.words ?? ""} ${it.words}`.split(" ").filter(Boolean))].join(" ").slice(0, 2000);
      const videosUsed = [...new Set([...(prev?.videos ?? []), videoId])];
      if (!prev) await tx.insert(library).values({ ...it, words, text: it.text.slice(0, 2000), videos: videosUsed });
      // the label and the cut stay as first kept; the files may have gained a cut-out
      else
        await tx
          .update(library)
          .set({ words, text: join(prev.text, it.text).slice(0, 2000), files: merge(prev.files, it.files), videos: videosUsed, usedAt: new Date() })
          .where(eq(library.assetId, it.assetId));
    }
  });
}

const join = (a: string, b: string) => (a.includes(b) ? a : `${a} / ${b}`);
const merge = (a: Asset[], b: Asset[]) => [...a, ...b.filter((f) => !a.some((x) => x.id === f.id))];

/** The whole library, the most recently used first. */
export async function listLibrary(db: Db, limit = 2000): Promise<LibraryRow[]> {
  return db.select().from(library).orderBy(desc(library.usedAt)).limit(limit);
}

export async function getLibraryItem(db: Db, assetId: string): Promise<LibraryRow | undefined> {
  const [r] = await db.select().from(library).where(eq(library.assetId, assetId));
  return r;
}

/**
 * Takes a picture out of the library. Its files go too when no video uses them any more;
 * returns their storage keys for the caller to remove.
 */
export async function removeFromLibrary(db: Db, assetId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(library).where(eq(library.assetId, assetId)).returning();
    if (!row) return [];
    const ids = row.files.map((f) => f.id);
    const used = sql`(
      select jsonb_object_keys(doc->'assets') from ${videos}
      union select jsonb_object_keys(doc->'assets') from ${videoVersions}
      union select jsonb_array_elements(files)->>'id' from ${library})`;
    const files = await tx
      .delete(assets)
      .where(sql`${inArray(assets.id, ids)} and ${assets.id} not in ${used}`)
      .returning({ key: assets.storageKey });
    return files.map((f) => f.key);
  });
}

/** Videos with an export, to fill the library with what they went out with. */
export async function exportedVideoIds(db: Db): Promise<string[]> {
  return (await db.select({ id: videos.id }).from(videos).where(isNotNull(videos.renderAsset))).map((r) => r.id);
}
