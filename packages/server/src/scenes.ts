import { buildScenes, sceneAssets, sceneDocument, type Asset, type ComposeContext, type Scene, type VideoDoc } from "@regie/core";
import { createHash } from "node:crypto";
import { brandFonts } from "./fonts";

/** Bump when the renderer itself changes, so cached clips are not reused. */
export const RENDERER_VERSION = "hf-0.8.214/1";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "video/mp4": "mp4" };
export const assetFile = (a: Pick<Asset, "id" | "mime">) => `${a.id}.${EXT[a.mime] ?? "bin"}`;

export function renderContext(doc: VideoDoc): ComposeContext {
  return {
    assets: doc.assets,
    src: (id) => {
      const a = doc.assets[id];
      return a ? `assets/img/${assetFile(a)}` : "";
    },
  };
}

export interface HashedScene {
  scene: Scene;
  html: string;
  hash: string;
}

/**
 * Every scene with the exact HTML the renderer will see and a hash of it.
 * Asset ids are content hashes, so the HTML pins the pixels: same hash, same clip.
 */
export function hashedScenes(doc: VideoDoc): { scenes: HashedScene[]; total: number } {
  const ctx = renderContext(doc);
  const font = brandFonts().name;
  const { scenes, total } = buildScenes(doc);
  return {
    total,
    scenes: scenes.map((scene) => {
      const html = sceneDocument(scene, ctx, "assets", font);
      const hash = createHash("sha256").update(RENDERER_VERSION).update(html).update(sceneAssets(scene).join(",")).digest("hex").slice(0, 32);
      return { scene, html, hash };
    }),
  };
}

/** Beats whose scene differs from the last export. */
export function dirtyBeats(doc: VideoDoc, rendered: string[]): string[] {
  const done = new Set(rendered);
  return hashedScenes(doc)
    .scenes.filter((s) => !done.has(s.hash))
    .flatMap((s) => s.scene.beats.map((b) => b.id));
}
