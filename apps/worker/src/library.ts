import { keywords, libraryForIdea, normalizeWords, type Asset, type VideoDoc } from "@regie/core";
import { exportedVideoIds, getDb, getVideo, keepInLibrary, listLibrary, type Keep, type LibraryRow } from "@regie/db";

/**
 * What each picture shot of a video keeps in the library: the picture as found (with its cut-out,
 * or a clip's first frame), the words of its idea and its line. The album cover stays out (it is
 * fetched free for each song), and so do the demo pictures.
 */
export function shotsToKeep(doc: VideoDoc): Keep[] {
  const out: Keep[] = [];
  for (const b of doc.beats) {
    if (!b.image || (b.layout !== "card" && b.layout !== "cutout") || b.imageQuery.kind === "cover") continue;
    const original = b.candidates.find((c) => c === b.image || doc.assets[c]?.clean === b.image) ?? b.image;
    const main = doc.assets[original];
    if (!main || main.source?.startsWith("démo")) continue;
    const extra = [main.clean, main.poster].map((id) => (id ? doc.assets[id] : undefined)).filter((a): a is Asset => Boolean(a));
    const { library: _, ...plain } = main;
    out.push({
      assetId: original,
      words: normalizeWords(`${b.imageQuery.queries.join(" ")} ${b.hero}`),
      text: b.text,
      label: (b.hero || b.imageQuery.queries[0] || b.text).slice(0, 60),
      files: [plain, ...extra],
      cut: b.image !== original,
    });
  }
  return out;
}

/** After an export: the pictures the video went out with join the library. */
export async function keepShots(videoId: string) {
  const row = await getVideo(getDb(), videoId);
  if (row) await keepInLibrary(getDb(), videoId, shotsToKeep(row.doc));
}

/** The videos exported before the library existed fill it once, when the worker starts. */
export async function fillLibrary() {
  if ((await listLibrary(getDb(), 1)).length) return;
  const ids = await exportedVideoIds(getDb());
  for (const id of ids) await keepShots(id);
  if (ids.length) console.log(`[bibliothèque] images de ${ids.length} vidéos déjà montées rangées`);
}

/** Library pictures that fit an idea and are not in the video yet. */
export async function fromLibrary(doc: VideoDoc, queries: string[], want: number): Promise<LibraryRow[]> {
  if (!keywords(queries.join(" ")).length) return [];
  const items = (await listLibrary(getDb())).filter((r) => !doc.assets[r.assetId]);
  return libraryForIdea(items, queries, want);
}
