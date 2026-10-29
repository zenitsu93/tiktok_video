import { z } from "zod";

/**
 * Every setting comes from the environment (encrypted variables on the host,
 * or a local .env that git ignores). Nothing secret is ever sent to the browser:
 * only the server and the worker import this file.
 */
const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET doit faire au moins 32 caractères"),
  MEDIA_SECRET: z.string().min(32, "MEDIA_SECRET doit faire au moins 32 caractères"),

  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  /** The only GitHub account allowed in. */
  OWNER_GITHUB_LOGIN: z.string().trim().min(1).default("zenitsu93"),
  /** Local development only: skips GitHub sign-in. Refused in production. */
  DEV_LOGIN: z.enum(["0", "1"]).default("0"),

  ANTHROPIC_API_KEY: optional,
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),

  ELEVENLABS_API_KEY: optional,
  ELEVENLABS_VOICE_ID: z.string().default("AYfOkr1hDQYbhigmRZ16"),
  ELEVENLABS_MODEL: z.string().default("eleven_v4"),

  APIFY_TOKEN: optional,
  APIFY_PINTEREST_ACTOR: z.string().default("automation-lab~pinterest-scraper"),

  /** TikTok app (Login Kit + Content Posting API, video.upload only): sends exports to the TikTok inbox. */
  TIKTOK_CLIENT_KEY: optional,
  TIKTOK_CLIENT_SECRET: optional,
  /** Each finished export goes to the TikTok inbox by itself (0: only with the button). */
  TIKTOK_AUTO_SEND: z.enum(["0", "1"]).default("1"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().default("./data"),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,

  BUDGET_DAY_USD: z.coerce.number().positive().default(5),
  BUDGET_VIDEO_USD: z.coerce.number().positive().default(2),

  /** A video untouched for this many days is deleted, with its files; 0 keeps everything. */
  RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration invalide :\n${lines}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && e.DEV_LOGIN === "1") throw new Error("DEV_LOGIN=1 est interdit en production");
  if (e.NODE_ENV === "production" && !(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET)) {
    throw new Error("GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET sont obligatoires en production");
  }
  if (e.STORAGE_DRIVER === "s3" && !(e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY)) {
    throw new Error("STORAGE_DRIVER=s3 demande S3_BUCKET, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY");
  }
  cached = e;
  return e;
}

/** Which providers run for real; the others fall back to demo stand-ins. */
export function providers() {
  const e = env();
  return {
    claude: Boolean(e.ANTHROPIC_API_KEY),
    voice: Boolean(e.ELEVENLABS_API_KEY),
    images: Boolean(e.APIFY_TOKEN),
  };
}
