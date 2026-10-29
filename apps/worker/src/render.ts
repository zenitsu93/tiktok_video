import { sceneAssets, type VideoDoc } from "@regie/core";
import { getAsset, getDb, getSceneRender, recordUsage, saveSceneRender } from "@regie/db";
import { assetFile, hashedScenes, storage, type HashedScene } from "@regie/server";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pLimit from "p-limit";
import { ff, storeFile, withTemp } from "./media";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = process.env.FONTS_DIR ?? resolve(HERE, "../../../brand/fonts");
const FONT_WEIGHTS = [200, 300, 400, 600, 700];

function hyperframesBin(): string {
  const pkgPath = require.resolve("hyperframes/package.json");
  const pkg = JSON.parse(require("node:fs").readFileSync(pkgPath, "utf8")) as { bin: string | Record<string, string> };
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.hyperframes!;
  return join(dirname(pkgPath), bin);
}

/** Writes a self-contained HyperFrames project for one scene and renders it (video only, no network). */
async function renderScene(s: HashedScene, doc: VideoDoc, out: string) {
  await withTemp(async (dir) => {
    const assets = join(dir, "assets");
    await mkdir(join(assets, "img"), { recursive: true });
    await mkdir(join(assets, "fonts"), { recursive: true });
    await copyFile(require.resolve("gsap/dist/gsap.min.js"), join(assets, "gsap.min.js"));
    await copyFile(require.resolve("gsap/dist/CustomEase.min.js"), join(assets, "CustomEase.min.js"));
    for (const w of FONT_WEIGHTS) await copyFile(join(FONTS_DIR, `oswald-${w}.woff2`), join(assets, "fonts", `oswald-${w}.woff2`));
    for (const id of sceneAssets(s.scene)) {
      const meta = doc.assets[id];
      const row = await getAsset(getDb(), id);
      if (!meta || !row) throw new Error(`image ${id} introuvable`);
      await storage().download(row.storageKey, join(assets, "img", assetFile(meta)));
    }
    await writeFile(join(dir, "index.html"), s.html);
    await run(process.execPath, [hyperframesBin(), "render", dir, "-o", out, "--fps", "30", "--quiet", "--workers", process.env.RENDER_WORKERS ?? "2"], {
      timeout: 10 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, HYPERFRAMES_TELEMETRY: "0", DO_NOT_TRACK: "1" },
    });
  });
}

/**
 * Exports the video. Scenes whose hash is already in the cache are reused as is,
 * so after a one-beat edit only that beat's scene goes through Chrome again.
 */
export async function exportVideo(videoId: string, doc: VideoDoc, onProgress: (done: number, total: number) => Promise<void>) {
  const db = getDb();
  const { scenes, total } = hashedScenes(doc);
  const started = Date.now();
  let rendered = 0;
  let done = 0;
  const limit = pLimit(Number(process.env.RENDER_SCENES_IN_PARALLEL ?? 2));
  await onProgress(0, scenes.length);
  return withTemp(async (dir) => {
    const files = await Promise.all(
      scenes.map((s, i) =>
        limit(async () => {
          const file = join(dir, `${String(i).padStart(3, "0")}.mp4`);
          const key = `renders/scenes/${s.hash}.mp4`;
          const cached = await getSceneRender(db, s.hash);
          if (cached && (await storage().exists(cached.storageKey))) {
            await storage().download(cached.storageKey, file);
          } else {
            await renderScene(s, doc, file);
            await storage().put(key, await readFile(file), "video/mp4");
            await saveSceneRender(db, s.hash, key);
            rendered++;
          }
          await onProgress(++done, scenes.length);
          return file;
        }),
      ),
    );

    // join the clips without re-encoding, then lay the voice track under them
    const list = join(dir, "list.txt");
    await writeFile(list, files.map((f) => `file '${f}'`).join("\n"));
    const joined = join(dir, "joined.mp4");
    await ff("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-an", joined], 300_000);
    const final = join(dir, "final.mp4");
    const args = ["-y", "-loglevel", "error", "-i", joined];
    if (doc.voiceTrack) {
      const row = await getAsset(db, doc.voiceTrack);
      if (row) {
        const voice = join(dir, "voice.m4a");
        await storage().download(row.storageKey, voice);
        args.push("-i", voice, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k");
      }
    }
    args.push("-c:v", "copy", "-t", total.toFixed(3), "-movflags", "+faststart", final);
    await ff("ffmpeg", args, 300_000);
    const asset = await storeFile("v", await readFile(final), "video/mp4", "mp4", "video", "export");
    await recordUsage(db, {
      videoId,
      provider: "render",
      operation: "export",
      units: { scenes: scenes.length, rendered, seconds: Math.round((Date.now() - started) / 1000) },
      costUsd: "0",
    });
    return { asset, hashes: scenes.map((s) => s.hash), rendered, total: scenes.length };
  });
}
