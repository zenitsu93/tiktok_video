import { timeBeats, voiceStale, type Beat, type Layout, type Entrance, type Move } from "@regie/core";
import { getDb, lastTikTokSend, listPronunciations, videoCosts, type TikTokSendStatus, type VideoRow } from "@regie/db";
import { dirtyBeats, providers, signMedia, tiktokConfigured, tiktokConnected } from "@regie/server";

/** What the browser gets for one video: the script, timings, signed image links, costs. No secrets, no storage keys. */
export interface BeatView {
  id: string;
  text: string;
  hero: string;
  layout: Layout;
  entrance: Entrance;
  /** Gesture that tells the line, picked when the script was split ("none" on older videos). */
  move: Move;
  image: string | null;
  candidates: string[];
  accent: boolean;
  italic: boolean;
  reveal: "type" | "fade";
  gap: number;
  start: number;
  end: number;
  voiceStale: boolean;
  queries: string[];
  /** "cover": the album cover (Deezer, free); "none": text only. */
  queryKind: "cover" | "pinterest" | "none";
}

export interface VideoView {
  id: string;
  title: string;
  artist: string;
  angle: string;
  status: VideoRow["status"];
  progress: VideoRow["progress"];
  error: string | null;
  version: number;
  total: number;
  beats: BeatView[];
  /** clean: the same image without its background; checker: it came on a fake checkerboard. */
  /** clip: a GIF or short video (silent MP4); `url` is then its first frame, for thumbnails. */
  images: Record<string, { url: string; accent: string | null; w?: number; h?: number; clean?: string; checker?: boolean; clip?: string }>;
  cover: string | null;
  sources: string[];
  /** « Je cherche moi-même » was chosen at the voice: the images come from La Planche. */
  manualImages: boolean;
  /** The script waiting for approval, before it is cut into shots. */
  draft: string | null;
  /** The TikTok caption with its hashtags, to paste in TikTok. */
  caption: string | null;
  /** The mixed voice, played by the page under the preview frame. */
  voice: string | null;
  /** How the voice says some words, for every video (the screen keeps the spelling). */
  pronunciations: { word: string; say: string }[];
  /** How many montages were tried (« Remonter autrement »), and the one on screen. */
  styles: number;
  styleIndex: number | null;
  /** Beat ids a job is working on, "caption" while the caption is being written, "restyle" while a new montage is drawn. */
  busy: string[];
  dirty: string[];
  download: string | null;
  /** When the MP4 was last downloaded, and when Thomas ticked « Publiée » (ISO dates). */
  downloadedAt: string | null;
  publishedAt: string | null;
  preview: string;
  costs: { provider: string; operation: string; calls: number; cost: number }[];
  spent: number;
  providers: { claude: boolean; voice: boolean; images: boolean };
  tiktok: {
    /** TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are set on the server. */
    configured: boolean;
    connected: boolean;
    /** The last send; `current` is false once a newer export exists. */
    send: { status: TikTokSendStatus; error: string | null; at: string; current: boolean } | null;
  };
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "video";

export async function videoView(row: VideoRow): Promise<VideoView> {
  const doc = row.doc;
  const { beats, total } = doc.beats.length ? timeBeats(doc) : { beats: [], total: 0 };
  const images: VideoView["images"] = {};
  const want = new Set<string>();
  // each candidate, and its cut-out version when it has one
  doc.beats.forEach((b: Beat) => b.candidates.forEach((c) => [c, doc.assets[c]?.clean].forEach((id) => id && want.add(id))));
  if (doc.cover) want.add(doc.cover);
  for (const id of want) {
    const a = doc.assets[id];
    if (a?.kind === "image") images[id] = { url: signMedia(id, 6 * 3600), accent: a.accent ?? null, w: a.width, h: a.height, clean: a.clean, checker: a.checker };
    else if (a?.kind === "video" && a.poster) images[id] = { url: signMedia(a.poster, 6 * 3600), accent: a.accent ?? null, w: a.width, h: a.height, clip: signMedia(id, 6 * 3600) };
  }
  const send = await lastTikTokSend(getDb(), row.id);
  const pronunciations = await listPronunciations(getDb());
  const lexicon = Object.fromEntries(pronunciations.map((p) => [p.word, p.say]));
  const configured = tiktokConfigured();
  const costs = (await videoCosts(getDb(), row.id)).map((c) => ({ ...c, cost: Number(c.cost) }));
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    angle: doc.angle,
    status: row.status,
    progress: row.progress,
    error: row.error,
    version: row.version,
    total,
    beats: beats.map((b) => ({
      id: b.id,
      text: b.text,
      hero: b.hero,
      layout: b.layout,
      entrance: b.entrance,
      move: b.move ?? "none",
      image: b.image,
      candidates: b.candidates,
      accent: b.accent,
      italic: Boolean(b.italic),
      reveal: b.reveal,
      gap: b.gap,
      start: b.start,
      end: b.end,
      voiceStale: voiceStale(b, lexicon),
      queries: b.imageQuery.queries,
      queryKind: b.imageQuery.kind,
    })),
    images,
    cover: doc.cover,
    sources: doc.sources,
    manualImages: Boolean(doc.manualImages),
    draft: doc.beats.length ? null : (doc.draft ?? null),
    caption: doc.caption ?? null,
    voice: doc.voiceTrack ? signMedia(doc.voiceTrack, 6 * 3600) : null,
    pronunciations,
    styles: doc.styles?.length ?? 0,
    styleIndex: doc.styleIndex ?? null,
    busy: row.busyBeats,
    dirty: row.renderAsset && doc.beats.length ? dirtyBeats(doc, row.renderedScenes) : [],
    download: row.renderAsset ? `${signMedia(row.renderAsset, 6 * 3600)}&dl=${slug(`${row.artist}-${row.title}`)}` : null,
    downloadedAt: row.downloadedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    preview: `/api/videos/${row.id}/preview?v=${row.version}`,
    costs,
    spent: costs.reduce((s, c) => s + c.cost, 0),
    providers: providers(),
    tiktok: {
      configured,
      connected: configured && (await tiktokConnected(getDb())),
      send: send
        ? { status: send.status, error: send.error, at: send.createdAt.toISOString(), current: send.renderAsset === row.renderAsset }
        : null,
    },
  };
}
