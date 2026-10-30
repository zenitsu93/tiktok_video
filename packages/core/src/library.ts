import type { Asset, VideoDoc } from "./schema";

/**
 * The image library: the pictures Thomas kept on a shot (or brought himself) come back for the
 * next videos, found by the words of their idea. Matching is plain word overlap, done in memory:
 * the library holds a few hundred pictures, not millions.
 */

/** Words that say nothing about what is in the picture (the search variants included). */
const EMPTY = new Set(
  (
    "the and with for from into over under his her their this that its are was were who what when " +
    "les des une un le la de du au aux et en sur dans par pour avec son sa ses leur qui que est sont il elle ils elles ce cette " +
    "vintage aesthetic photo photos picture image images photography close black white editorial film still candid style " +
    "old retro hd high quality wallpaper pinterest"
  ).split(" "),
);

export function normalizeWords(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words of a search or a label that can tell two pictures apart. */
export function keywords(s: string): string[] {
  return [...new Set(normalizeWords(s).split(" ").filter((w) => w.length >= 3 && !EMPTY.has(w)))];
}

/** « micro » finds « microphone », « concerts » finds « concert ». */
const same = (a: string, b: string) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));

/** How many of the asked words the picture's words cover. */
export function overlap(asked: string[], words: string[]): number {
  return asked.filter((a) => words.some((w) => same(a, w))).length;
}

/**
 * The idea is the same: two shared words, or every word when the idea has only one.
 * Strict on purpose: a picture that comes back by itself must fit, a wrong one costs a click.
 */
export function sameIdea(queries: string[], words: string[]): boolean {
  const asked = keywords(queries.join(" "));
  if (!asked.length) return false;
  return overlap(asked, words) >= Math.min(2, asked.length);
}

export interface LibraryEntry {
  assetId: string;
  /** The words of the idea it was kept for: its searches and its big word. */
  words: string;
  /** The line it was shown on, so a French search (« micro ») finds it too. */
  text: string;
}

/** Library pictures for a typed search, best first: every typed word must be found. */
export function searchLibrary<T extends LibraryEntry>(items: T[], q: string, limit = 40): T[] {
  const asked = keywords(q);
  if (!asked.length) return items.slice(0, limit);
  return items
    .map((it) => {
      const tags = keywords(it.words);
      const all = [...tags, ...keywords(it.text)];
      return { it, n: overlap(asked, all), tag: overlap(asked, tags) };
    })
    .filter((r) => r.n === asked.length)
    .sort((a, b) => b.tag - a.tag)
    .slice(0, limit)
    .map((r) => r.it);
}

/**
 * Library pictures that fit an idea's searches, best first. `loose`: one shared word is enough,
 * for suggestions Thomas picks from himself; the Régie only takes on its own what `sameIdea` accepts.
 */
export function libraryForIdea<T extends LibraryEntry>(items: T[], queries: string[], limit = 6, loose = false): T[] {
  const asked = keywords(queries.join(" "));
  if (!asked.length) return [];
  return items
    .map((it) => ({ it, n: overlap(asked, keywords(it.words)) }))
    .filter((r) => r.n >= (loose ? 1 : Math.min(2, asked.length)))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((r) => r.it);
}

export interface LibraryPicture {
  assetId: string;
  files: Asset[];
  cut: boolean;
}

/** The files of a library picture as a video stores them: the picture is marked as coming from the library. */
export function libraryAssets(p: LibraryPicture): Record<string, Asset> {
  return Object.fromEntries(p.files.map((f) => [f.id, f.id === p.assetId ? { ...f, library: true } : f]));
}

/** What a shot shows of a library picture: its cut-out when it was kept cut out. */
export function libraryShown(p: LibraryPicture): string {
  const main = p.files.find((f) => f.id === p.assetId);
  return p.cut && main?.clean && p.files.some((f) => f.id === main.clean) ? main.clean : p.assetId;
}

/** Puts a library picture on shots (the lines of one idea): first among their images, and shown. Free. */
export function putFromLibrary(doc: VideoDoc, p: LibraryPicture, beatIds: string[]): VideoDoc {
  const image = libraryShown(p);
  const clip = p.files.find((f) => f.id === p.assetId)?.kind === "video";
  return {
    ...doc,
    assets: { ...doc.assets, ...libraryAssets(p) },
    beats: doc.beats.map((b) =>
      beatIds.includes(b.id)
        ? {
            ...b,
            image,
            candidates: [p.assetId, ...b.candidates.filter((c) => c !== p.assetId)].slice(0, 24),
            // a clip plays in a card; a cut-out is posed on the white
            layout: !clip && image !== p.assetId ? "cutout" : "card",
          }
        : b,
    ),
  };
}
