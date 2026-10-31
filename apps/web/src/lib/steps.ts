import type { BeatView, VideoView } from "./view";

/** La Piste: the six steps of a video, each one a tab that opens again at any time. */
export const STEPS = [
  { title: "Histoire", sub: "écriture, relecture" },
  { title: "Voix", sub: "découpage, écoute" },
  { title: "Images", sub: "Pinterest ou à la main" },
  { title: "Montage", sub: "aperçu, retouches" },
  { title: "Fichier", sub: "MP4" },
  { title: "TikTok", sub: "envoi, légende" },
] as const;

/** Who has the hand on the current step: the Régie at work, Thomas, done, or stopped by an error. */
export type Who = "run" | "you" | "done" | "err";

export const needsImage = (b: BeatView) => b.layout === "card" || b.layout === "cutout";
/** Lines that need a picture and have none (the search failed, or the budget ran out). */
export const missingImages = (v: VideoView) => v.beats.filter((b) => !b.image && needsImage(b));
export const voiceMissing = (v: VideoView) => v.beats.some((b) => b.voiceStale);
/** The MP4 is the preview: nothing changed since it was made. */
export const upToDate = (v: VideoView) => Boolean(v.download) && v.dirty.length === 0 && !voiceMissing(v);
/** The script is being read: the first draft waits for approval, or Claude rewrites it. */
export const rewriting = (v: VideoView) => v.status === "generating" && /réécriture/i.test(v.progress?.step ?? "");
export const reading = (v: VideoView) => v.draft !== null && (v.status === "review" || rewriting(v));

/** The step a worker progress line belongs to (« Écriture du script », « Voix off », « Images »…). */
function stepOfProgress(v: VideoView): number {
  const s = v.progress?.step ?? "";
  if (/fichier|montage|rendu/i.test(s)) return 4;
  if (/image/i.test(s)) return 2;
  if (/voix|découpage/i.test(s)) return 1;
  if (/écriture|script/i.test(s)) return 0;
  return v.beats.length ? 3 : 0;
}

export function stepOf(v: VideoView): { step: number; who: Who } {
  switch (v.status) {
    case "error":
      return { step: stepOfProgress(v), who: "err" };
    case "draft":
      return { step: 0, who: "run" };
    case "review":
      return { step: 0, who: "you" };
    case "generating":
      if (rewriting(v)) return { step: 0, who: "run" };
      return { step: v.beats.length || /découpage/i.test(v.progress?.step ?? "") ? Math.max(1, stepOfProgress(v)) : 0, who: "run" };
    case "listen":
      return { step: 1, who: "you" };
    case "rendering":
      return { step: 4, who: "run" };
    case "ready":
      if (v.busy.includes("restyle")) return { step: 3, who: "run" };
      if (!v.download) return { step: v.manualImages && missingImages(v).length > 0 ? 2 : 3, who: "you" };
      if (!upToDate(v)) return { step: 3, who: "you" };
      return v.tiktok.send?.current && v.tiktok.send.status === "inbox" ? { step: 5, who: "done" } : { step: 5, who: "you" };
  }
}

/** A tab opens once its step was reached; with an MP4 made, every tab opens. */
export const reachable = (v: VideoView, step: number, i: number) => i <= step || Boolean(v.download);
