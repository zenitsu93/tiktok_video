import { describe, expect, it } from "vitest";
import { reachable, stepOf } from "./steps";
import type { BeatView, VideoView } from "./view";

const beat = (id: string, over: Partial<BeatView> = {}): BeatView => ({
  id,
  text: "Une phrase",
  hero: "",
  layout: "card",
  entrance: "pop",
  move: "none",
  image: "img",
  candidates: ["img"],
  accent: false,
  italic: false,
  reveal: "type",
  gap: 0.2,
  start: 0,
  end: 1,
  voiceStale: false,
  queries: [],
  queryKind: "pinterest",
  ...over,
} as BeatView);

const video = (over: Partial<VideoView> = {}): VideoView => ({
  id: "v",
  title: "We Are the World",
  artist: "USA for Africa",
  angle: "",
  status: "ready",
  progress: null,
  error: null,
  version: 3,
  total: 2,
  beats: [beat("b01"), beat("b02")],
  images: {},
  cover: null,
  covers: [],
  sources: [],
  manualImages: false,
  draft: null,
  caption: null,
  voice: null,
  pronunciations: [],
  styles: 1,
  styleIndex: 0,
  busy: [],
  dirty: [],
  download: null,
  downloadedAt: null,
  publishedAt: null,
  preview: "",
  costs: [],
  spent: 0,
  providers: { claude: true, voice: true, images: true },
  tiktok: { configured: true, connected: true, send: null },
  ...over,
} as VideoView);

describe("stepOf", () => {
  it("follows the video from the writing to TikTok", () => {
    expect(stepOf(video({ status: "generating", beats: [], progress: { step: "Écriture du script", done: 0, total: 1 } }))).toEqual({ step: 0, who: "run" });
    expect(stepOf(video({ status: "review", beats: [], draft: "Le script" }))).toEqual({ step: 0, who: "you" });
    expect(stepOf(video({ status: "generating", beats: [], draft: "Le script", progress: { step: "Découpage en plans", done: 0, total: 1 } }))).toEqual({ step: 1, who: "run" });
    expect(stepOf(video({ status: "generating", progress: { step: "Voix off", done: 1, total: 2 } }))).toEqual({ step: 1, who: "run" });
    expect(stepOf(video({ status: "listen" }))).toEqual({ step: 1, who: "you" });
    expect(stepOf(video({ status: "generating", progress: { step: "Images", done: 1, total: 4 } }))).toEqual({ step: 2, who: "run" });
    expect(stepOf(video())).toEqual({ step: 3, who: "you" });
    expect(stepOf(video({ status: "rendering" }))).toEqual({ step: 4, who: "run" });
    expect(stepOf(video({ download: "/mp4" }))).toEqual({ step: 5, who: "you" });
    // in the TikTok inbox is not published yet: only the tick ends the Piste
    expect(stepOf(video({ download: "/mp4", tiktok: { configured: true, connected: true, send: { status: "inbox", error: null, at: "", current: true } } }))).toEqual({
      step: 5,
      who: "you",
    });
    expect(stepOf(video({ download: "/mp4", publishedAt: "2026-10-31T01:00:00.000Z" }))).toEqual({ step: 5, who: "done" });
  });

  it("keeps the rewrite of the script on Histoire", () => {
    expect(stepOf(video({ status: "generating", beats: [], draft: "Le script", progress: { step: "Réécriture du script", done: 0, total: 1 } }))).toEqual({ step: 0, who: "run" });
  });

  it("sends « je cherche moi-même » to Images while a picture is missing", () => {
    expect(stepOf(video({ manualImages: true, beats: [beat("b01", { image: null }), beat("b02")] }))).toEqual({ step: 2, who: "you" });
    expect(stepOf(video({ manualImages: true }))).toEqual({ step: 3, who: "you" });
  });

  it("goes back to Montage when a shot changed after the MP4, and to the right step on an error", () => {
    expect(stepOf(video({ download: "/mp4", dirty: ["b02"] }))).toEqual({ step: 3, who: "you" });
    expect(stepOf(video({ download: "/mp4", beats: [beat("b01", { voiceStale: true })] }))).toEqual({ step: 3, who: "you" });
    expect(stepOf(video({ status: "error", progress: { step: "Images", done: 5, total: 8 } }))).toEqual({ step: 2, who: "err" });
    expect(stepOf(video({ busy: ["restyle"] }))).toEqual({ step: 3, who: "run" });
  });

  it("opens every tab once an MP4 exists", () => {
    expect(reachable(video(), 3, 5)).toBe(false);
    expect(reachable(video({ download: "/mp4" }), 3, 5)).toBe(true);
    expect(reachable(video(), 3, 0)).toBe(true);
  });
});
