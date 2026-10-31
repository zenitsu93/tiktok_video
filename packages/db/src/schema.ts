import type { VideoDoc } from "@regie/core";
import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** review: the script waits to be read; listen: the voice waits to be heard; ready: shots to check, then the montage. */
export type VideoStatus = "draft" | "review" | "generating" | "listen" | "ready" | "rendering" | "error";

export interface Progress {
  step: string;
  done: number;
  total: number;
}

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    status: text("status").$type<VideoStatus>().notNull().default("draft"),
    progress: jsonb("progress").$type<Progress | null>(),
    /** Beats, assets and timing: the whole editable video. */
    doc: jsonb("doc").$type<VideoDoc>().notNull(),
    version: integer("version").notNull().default(1),
    /** Scene hashes of the last export, to show which beats changed since. */
    renderedScenes: jsonb("rendered_scenes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    renderAsset: text("render_asset"),
    /** Beats a job is working on right now, shown as a spinner on the line. */
    busyBeats: jsonb("busy_beats").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    error: text("error"),
    /** Last time the MP4 was downloaded from the Régie. */
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    /** Ticked by Thomas once the video is out on TikTok, whichever way it went there. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("videos_updated_idx").on(t.updatedAt)],
);

/** Every saved state of a video, so any edit can be undone. */
export const videoVersions = pgTable(
  "video_versions",
  {
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    doc: jsonb("doc").$type<VideoDoc>().notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.version] })],
);

/** Files in storage. The id is derived from the content, so the same file is stored once. */
export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"image" | "audio" | "video">().notNull(),
  mime: text("mime").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  storageKey: text("storage_key").notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Rendered scene clips, keyed by the hash of everything that affects their pixels. */
export const sceneRenders = pgTable("scene_renders", {
  hash: text("hash").primaryKey(),
  storageKey: text("storage_key").notNull(),
  /** The video it was made for, so deleting the video takes its scenes too (made ahead or from an older export). */
  videoId: uuid("video_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per paid call, to show what each video costs and enforce the budget. */
export const usage = pgTable(
  "usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
    provider: text("provider").$type<"claude" | "elevenlabs" | "apify" | "render">().notNull(),
    operation: text("operation").notNull(),
    units: jsonb("units").$type<Record<string, number>>().notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 5 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_video_idx").on(t.videoId), index("usage_created_idx").on(t.createdAt)],
);

/** The owner's TikTok connection, one row. Both tokens are sealed (AES-GCM) before they get here. */
export const tiktokAuth = pgTable("tiktok_auth", {
  id: text("id").primaryKey(),
  openId: text("open_id").notNull(),
  scope: text("scope").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TikTokSendStatus = "sending" | "processing" | "inbox" | "error";

/** Each export sent to the TikTok inbox, newest last. */
export const tiktokSends = pgTable(
  "tiktok_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    renderAsset: text("render_asset").notNull(),
    publishId: text("publish_id"),
    status: text("status").$type<TikTokSendStatus>().notNull().default("sending"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tiktok_sends_video_idx").on(t.videoId, t.createdAt)],
);

/**
 * How the voice says a word, for every video (Sade → Chadé): the screen keeps the real
 * spelling, only the text sent to the voice changes. One line per word, whatever its case.
 */
export const pronunciations = pgTable("pronunciations", {
  word: text("word").primaryKey(),
  say: text("say").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Pinterest searches already paid for, by their exact words (lowercase, single spaces).
 * The same search again takes these pins instead of paying Apify a second time.
 */
export const pinSearches = pgTable("pin_searches", {
  query: text("query").primaryKey(),
  /** The best image address of each pin returned, in Pinterest's order. */
  urls: jsonb("urls").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
