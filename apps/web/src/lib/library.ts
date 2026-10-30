import { libraryShown } from "@regie/core";
import type { LibraryRow } from "@regie/db";
import { signMedia } from "@regie/server";

/** A library picture as the browser gets it: a signed thumbnail, what it shows, how often it served. */
export interface LibraryItem {
  /** The picture's asset id; `assetId`, `words` and `text` are what the search in @regie/core reads. */
  assetId: string;
  words: string;
  label: string;
  text: string;
  url: string;
  /** A GIF or short video: the clip itself (`url` is then its first frame). */
  clip?: string;
  cut: boolean;
  uses: number;
}

export function libraryItem(r: LibraryRow): LibraryItem {
  const shown = r.files.find((f) => f.id === libraryShown(r)) ?? r.files[0]!;
  const clip = shown.kind === "video";
  return {
    assetId: r.assetId,
    words: r.words,
    label: r.label,
    text: r.text,
    url: signMedia(clip && shown.poster ? shown.poster : shown.id, 6 * 3600),
    ...(clip ? { clip: signMedia(shown.id, 6 * 3600) } : {}),
    cut: shown.id !== r.assetId,
    uses: r.videos.length,
  };
}
