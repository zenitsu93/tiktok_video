import type { Asset } from "@regie/core";
import { getDb, saveAsset } from "@regie/db";
import { storage } from "@regie/server";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

/** Runs ffmpeg/ffprobe with an argument list (never through a shell). */
export async function ff(bin: "ffmpeg" | "ffprobe", args: string[], timeoutMs = 120_000) {
  return run(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
}

export async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "regie-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const idOf = (prefix: string, body: Buffer) => prefix + createHash("sha256").update(body).digest("hex").slice(0, 31);

/**
 * Picks the strongest colour of an image and darkens it so it reads on white
 * (the skill's accent rule). Returns null for greyish pictures.
 */
export async function accentOf(img: Buffer): Promise<string | null> {
  const { data } = await sharp(img).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let best: [number, number, number] | null = null;
  let score = 0;
  for (let i = 0; i < data.length; i += 3) {
    const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);
    const sc = s * (1 - Math.abs(l - 0.5));
    if (sc > score) {
      score = sc;
      best = [h, s, l];
    }
  }
  if (!best || score < 0.25) return null;
  const [h, s, l] = best;
  return hslToHex(h, Math.min(1, s), Math.min(l, 0.38));
}

/** Decodes, strips metadata, caps the size and re-encodes: nothing from the original file reaches the renderer. */
export async function ingestImage(input: Buffer, source: string): Promise<Asset> {
  const img = sharp(input, { limitInputPixels: 64_000_000, failOn: "error" }).rotate();
  const meta = await img.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);
  const out = await img
    .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
    [hasAlpha ? "png" : "jpeg"](hasAlpha ? { compressionLevel: 9 } : { quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const id = idOf("i", out.data);
  const mime = hasAlpha ? "image/png" : "image/jpeg";
  const key = `assets/${id}.${hasAlpha ? "png" : "jpg"}`;
  if (!(await storage().exists(key))) await storage().put(key, out.data, mime);
  await saveAsset(getDb(), { id, kind: "image", mime, size: out.data.length, storageKey: key, source });
  return { id, kind: "image", mime, width: out.info.width, height: out.info.height, accent: await accentOf(out.data), source };
}

export async function audioDuration(path: string): Promise<number> {
  const { stdout } = await ff("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error("durée audio illisible");
  return Math.round(d * 1000) / 1000;
}

/** Trims leading/trailing silence so beats sit tight against each other, and stores the clip. */
export async function ingestVoice(input: Buffer, source: string, trim = true): Promise<Asset> {
  return withTemp(async (dir) => {
    const src = join(dir, "in.mp3");
    const out = join(dir, "out.m4a");
    await writeFile(src, input);
    const encode = (filter: string[]) =>
      ff("ffmpeg", ["-y", "-loglevel", "error", "-i", src, ...filter, "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "128k", out]);
    const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse";
    await encode(trim ? ["-af", TRIM] : []);
    // a clip that is all silence would trim to nothing: keep it whole
    if (trim && !(await audioDuration(out).catch(() => 0))) await encode([]);
    const body = await readFile(out);
    const id = idOf("a", body);
    const key = `assets/${id}.m4a`;
    if (!(await storage().exists(key))) await storage().put(key, body, "audio/mp4");
    await saveAsset(getDb(), { id, kind: "audio", mime: "audio/mp4", size: body.length, storageKey: key, source });
    return { id, kind: "audio", mime: "audio/mp4", duration: await audioDuration(out), source };
  });
}

export async function storeFile(prefix: string, body: Buffer, mime: string, ext: string, kind: Asset["kind"], source: string): Promise<Asset> {
  const id = idOf(prefix, body);
  const key = `assets/${id}.${ext}`;
  if (!(await storage().exists(key))) await storage().put(key, body, mime);
  await saveAsset(getDb(), { id, kind, mime, size: body.length, storageKey: key, source });
  return { id, kind, mime, source };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
