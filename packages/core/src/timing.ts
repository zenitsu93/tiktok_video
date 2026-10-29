import type { Beat, VideoDoc } from "./schema";

export const FPS = 30;
/** Silence before the first word, so frame 0 already shows the hook being typed. */
export const LEAD = 0.3;
/** Hold after the last word, so the outro can loop back to the intro. */
export const TAIL = 1.2;

export interface TimedBeat extends Beat {
  /** First frame of speech. Starts sit on frame boundaries, so moving a beat shifts it by whole frames. */
  startFrame: number;
  /** Seconds, absolute (startFrame / FPS). */
  start: number;
  /** End of speech. */
  end: number;
  /** Start of the following beat (or end of video). */
  next: number;
}

/** Speaking time when no voice clip exists yet (about 15 characters per second). */
export function estimateSpeech(text: string): number {
  return Math.max(0.6, Math.round((text.length / 15) * 100) / 100);
}

export function beatDuration(doc: VideoDoc, beat: Beat): number {
  const clip = beat.voice ? doc.assets[beat.voice] : undefined;
  return clip?.duration ?? estimateSpeech(beat.text);
}

export function timeBeats(doc: VideoDoc): { beats: TimedBeat[]; total: number } {
  let t = LEAD;
  const out: TimedBeat[] = [];
  for (const beat of doc.beats) {
    const d = beatDuration(doc, beat);
    const startFrame = Math.ceil(t * FPS - 1e-6);
    const start = startFrame / FPS;
    const end = start + d;
    out.push({ ...beat, startFrame, start, end, next: 0 });
    t = end + beat.gap;
  }
  const last = out.at(-1);
  const total = Math.ceil((last ? Math.max(t, last.end + TAIL) : LEAD + TAIL) * FPS - 1e-6) / FPS;
  out.forEach((b, i) => {
    b.next = i + 1 < out.length ? out[i + 1]!.start : total;
  });
  return { beats: out, total };
}

export function round(n: number, step = 1000): number {
  return Math.round(n * step) / step;
}

export function toFrame(seconds: number): number {
  return Math.round(seconds * FPS);
}
