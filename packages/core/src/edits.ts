import type { Beat, BeatPatch, VideoDoc } from "./schema";

export class EditError extends Error {}

/**
 * Applies a hand edit to one beat. Hand edits never call a model: they change the
 * document, and the preview and render pick the change up from there.
 * Returns the new document and whether the voice must be regenerated.
 */
export function applyBeatPatch(doc: VideoDoc, beatId: string, patch: BeatPatch): { doc: VideoDoc; voiceChanged: boolean } {
  const i = doc.beats.findIndex((b) => b.id === beatId);
  if (i < 0) throw new EditError(`Le plan ${beatId} n'existe pas.`);
  const before = doc.beats[i]!;
  const next: Beat = { ...before, ...patch };
  // a candidate, or its version without background
  const allowed = new Set(next.candidates.flatMap((c) => [c, doc.assets[c]?.clean ?? c]));
  if (patch.image !== undefined && patch.image !== null && !allowed.has(patch.image)) {
    throw new EditError("Cette image n'appartient pas aux images de ce plan.");
  }
  if (next.hero && !next.text.toLowerCase().includes(next.hero.toLowerCase())) {
    // a hero that is no longer in the sentence would never show; drop it
    if (patch.hero !== undefined) throw new EditError("Le mot héros doit apparaître dans la phrase.");
    next.hero = "";
  }
  if ((next.layout === "card" || next.layout === "cutout") && !next.image && next.candidates[0]) {
    next.image = next.candidates[0];
  }
  const beats = doc.beats.slice();
  beats[i] = next;
  return { doc: { ...doc, beats }, voiceChanged: before.text !== next.text };
}

/**
 * The sentence as the voice must read it: each word of the pronunciation lexicon
 * (whole word, any case) becomes how to say it. The screen keeps the sentence as written.
 */
export function spokenText(text: string, lexicon: Record<string, string>): string {
  let out = text;
  // longest first, so « Sade Adu » wins over « Sade »
  for (const word of Object.keys(lexicon).sort((a, b) => b.length - a.length)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"), () => lexicon[word]!);
  }
  return out;
}

/** True when the voice clip was made from another text than the one the voice should read now. */
export function voiceStale(beat: Beat, lexicon: Record<string, string> = {}): boolean {
  return beat.voice === null || beat.voiceText !== spokenText(beat.text, lexicon);
}

/**
 * Reads a correction typed in the command bar: "@b08 une photo plus vieille".
 * Without a beat reference, the selected beat is the target.
 */
export function parseCommand(input: string, selected: string | null): { beatId: string | null; instruction: string } {
  const m = /^\s*@(b\d{2,3})\b[\s,:]*(.*)$/is.exec(input);
  if (m) return { beatId: m[1]!.toLowerCase(), instruction: m[2]!.trim() };
  return { beatId: selected, instruction: input.trim() };
}

/** Neighbouring lines sent to Claude with a one-beat edit, so it keeps the flow without the whole script. */
export function beatContext(doc: VideoDoc, beatId: string, radius = 2): { before: string[]; target: Beat; after: string[] } {
  const i = doc.beats.findIndex((b) => b.id === beatId);
  if (i < 0) throw new EditError(`Le plan ${beatId} n'existe pas.`);
  return {
    before: doc.beats.slice(Math.max(0, i - radius), i).map((b) => b.text),
    target: doc.beats[i]!,
    after: doc.beats.slice(i + 1, i + 1 + radius).map((b) => b.text),
  };
}
