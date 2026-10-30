import { PgBoss } from "pg-boss";
import { z } from "zod";
import { env } from "./env";

/** Background jobs. Each one names exactly what it touches, so nothing else is recomputed. */
export const JOBS = {
  /** Full pipeline for a new video: script, voice, images, then export. */
  generate: "video-generate",
  /** One beat's voice clip. */
  voice: "beat-voice",
  /** New image candidates for one beat. */
  images: "beat-images",
  /** An image Thomas brought himself, for one beat. */
  upload: "beat-upload",
  /** Cut the background out of one beat's image. */
  clean: "beat-clean",
  /** Rewrite the whole script with Claude, before it is approved. */
  script: "script-rewrite",
  /** Rewrite one beat with Claude. */
  rewrite: "beat-rewrite",
  /** Export the MP4, re-rendering only the scenes that changed. */
  render: "video-render",
  /** Send the last export to the owner's TikTok inbox. */
  tiktok: "tiktok-send",
  /** Write the TikTok caption again, from the script as it reads now. */
  caption: "video-caption",
  /** Scenes rendered ahead into the cache while the shots are checked: only this server's time. */
  prerender: "video-prerender",
  /** Every night: delete the videos untouched for RETENTION_DAYS days. */
  cleanup: "videos-cleanup",
} as const;

export const jobData = {
  [JOBS.generate]: z.object({ videoId: z.string().uuid() }),
  [JOBS.voice]: z.object({ videoId: z.string().uuid(), beatId: z.string() }),
  [JOBS.images]: z.object({ videoId: z.string().uuid(), beatId: z.string(), instruction: z.string().max(500).optional() }),
  [JOBS.clean]: z.object({ videoId: z.string().uuid(), beatId: z.string() }),
  [JOBS.upload]: z.object({ videoId: z.string().uuid(), beatId: z.string(), key: z.string().regex(/^uploads\/[0-9a-f-]{36}$/), also: z.array(z.string()).max(40).optional() }),
  [JOBS.script]: z.object({ videoId: z.string().uuid(), instruction: z.string().min(1).max(1000) }),
  [JOBS.rewrite]: z.object({ videoId: z.string().uuid(), beatId: z.string(), instruction: z.string().min(1).max(500) }),
  [JOBS.render]: z.object({ videoId: z.string().uuid() }),
  [JOBS.tiktok]: z.object({ videoId: z.string().uuid(), sendId: z.string().uuid() }),
  [JOBS.caption]: z.object({ videoId: z.string().uuid() }),
  [JOBS.cleanup]: z.object({}),
  [JOBS.prerender]: z.object({ videoId: z.string().uuid() }),
};

export type JobName = (typeof JOBS)[keyof typeof JOBS];
export type JobData<N extends JobName> = z.infer<(typeof jobData)[N]>;

let boss: Promise<PgBoss> | undefined;

export function queue(): Promise<PgBoss> {
  boss ??= (async () => {
    const b = new PgBoss(env().DATABASE_URL);
    b.on("error", (e) => console.error("[queue]", e));
    await b.start();
    for (const name of Object.values(JOBS)) {
      // one export per video at a time; a newer request waits for the current one (same for the head start)
      await b.createQueue(name, name === JOBS.render || name === JOBS.prerender ? { policy: "stately" } : {});
    }
    return b;
  })();
  return boss;
}

/** How many times a failed job is tried again before the video shows an error. */
// a TikTok send is never retried on its own: a second try could land a second copy in the inbox
// a head start that fails is not worth another go: the export does the scene anyway
export const retryLimit = (name: JobName) => (name === JOBS.tiktok || name === JOBS.prerender ? 0 : name === JOBS.generate || name === JOBS.render ? 4 : 3);

export async function enqueue<N extends JobName>(name: N, data: JobData<N>): Promise<string | null> {
  const parsed = jobData[name].parse(data);
  const b = await queue();
  return b.send(name, parsed, {
    // spaced retries (10 s, 20 s, 40 s…) ride out a few minutes without internet;
    // the pipeline skips what is already done, so a retry does not pay twice
    retryLimit: retryLimit(name),
    retryDelay: 10,
    retryBackoff: true,
    singletonKey: name === JOBS.render || name === JOBS.prerender ? (parsed as JobData<typeof JOBS.render>).videoId : undefined,
  });
}
