import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { env } from "@regie/server";
import sharp from "sharp";
import { withTemp } from "./media";

const run = promisify(execFile);

/**
 * Pinterest is full of PNGs saved "with transparency" where the grey-and-white checkerboard
 * of an image editor was flattened into the pixels. On the white of the video it shows as a
 * fake background. These helpers find that pattern and cut it out, without any model:
 * the checkerboard is exactly where the transparency used to be.
 */

type Raw = { data: Buffer; width: number; height: number };

const lum = (d: Buffer, i: number) => (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
const neutral = (d: Buffer, i: number, tol: number) => Math.max(d[i]!, d[i + 1]!, d[i + 2]!) - Math.min(d[i]!, d[i + 1]!, d[i + 2]!) <= tol;

/** The two grey levels of a checkerboard, or null when the frame of the image is not one. */
export function checkerLevels({ data, width, height }: Raw): [number, number] | null {
  const band = Math.max(4, Math.round(Math.min(width, height) * 0.04));
  const inBand = (x: number, y: number) => x < band || y < band || x >= width - band || y >= height - band;
  // light, colourless pixels around the edge
  const lums: number[] = [];
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inBand(x, y)) continue;
      total++;
      const i = (y * width + x) * 3;
      const l = lum(data, i);
      if (l >= 150 && neutral(data, i, 18)) lums.push(l);
    }
  }
  if (lums.length < total * 0.6) return null;
  // two clusters (2-means), each a real share of the edge and clearly apart
  let lo = 255;
  let hi = 0;
  for (const l of lums) {
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  if (hi - lo < 12) return null;
  for (let k = 0; k < 8; k++) {
    const mid = (lo + hi) / 2;
    let sl = 0, nl = 0, sh = 0, nh = 0;
    for (const l of lums) l < mid ? ((sl += l), nl++) : ((sh += l), nh++);
    if (!nl || !nh) return null;
    lo = sl / nl;
    hi = sh / nh;
  }
  const mid = (lo + hi) / 2;
  const share = lums.filter((l) => l < mid).length / lums.length;
  if (hi - lo < 12 || hi - lo > 100 || share < 0.2 || share > 0.8) return null;

  // and they alternate in regular squares: runs along the top/bottom rows and left/right columns
  const runs: number[] = [];
  const scan = (at: (t: number) => number, n: number) => {
    let level = -1;
    let len = 0;
    const row: number[] = [];
    for (let t = 0; t < n; t++) {
      const i = at(t);
      const l = lum(data, i);
      const lv = l >= 150 && neutral(data, i, 18) ? (l < mid ? 0 : 1) : -1;
      if (lv === level) len++;
      else {
        if (level >= 0) row.push(len);
        level = lv;
        len = 1;
      }
    }
    runs.push(...row.slice(1)); // the first run is cut by the edge of the image
  };
  for (const y of [1, Math.floor(band / 2), height - 2, height - 1 - Math.floor(band / 2)]) scan((x) => (y * width + x) * 3, width);
  for (const x of [1, Math.floor(band / 2), width - 2, width - 1 - Math.floor(band / 2)]) scan((y) => (y * width + x) * 3, height);
  if (runs.length < 16) return null;
  const sorted = [...runs].sort((a, b) => a - b);
  const m = sorted[Math.floor(sorted.length / 2)]!;
  if (m < 3 || m > 80) return null;
  const regular = runs.filter((r) => r >= m * 0.6 && r <= m * 1.4).length / runs.length;
  return regular >= 0.6 ? [lo, hi] : null;
}

/** True when the image carries a flattened checkerboard instead of a real background. */
export async function hasChecker(img: Buffer): Promise<boolean> {
  const { data, info } = await sharp(img)
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true, kernel: "nearest" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return checkerLevels({ data, width: info.width, height: info.height }) !== null;
}

/**
 * Removes the checkerboard: floods it in from the edges, then clears the enclosed patches of
 * the same pattern (between an arm and a body). Returns a PNG with alpha cropped to the subject,
 * or null when what is left is not a plausible subject (almost nothing, or almost everything).
 */
export async function removeChecker(img: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(img, { limitInputPixels: 64_000_000 })
    .rotate()
    .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const levels = checkerLevels({ data, width, height });
  if (!levels) return null;
  const n = width * height;
  const bg = new Uint8Array(n); // 1 = checker colour
  for (let p = 0; p < n; p++) {
    const i = p * 3;
    const l = lum(data, i);
    if (neutral(data, i, 20) && (Math.abs(l - levels[0]) <= 16 || Math.abs(l - levels[1]) <= 16)) bg[p] = 1;
  }
  const gone = new Uint8Array(n);
  const mid = (levels[0] + levels[1]) / 2;
  const flood = (seeds: number[], keepIf?: (area: number, darkShare: number) => boolean) => {
    const stack = [...seeds];
    const seen: number[] = [];
    let dark = 0;
    for (const s of seeds) gone[s] = 2;
    while (stack.length) {
      const p = stack.pop()!;
      seen.push(p);
      if (lum(data, p * 3) < mid) dark++;
      const x = p % width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q >= 0 && q < n && bg[q] && !gone[q]) {
          gone[q] = 2;
          stack.push(q);
        }
      }
    }
    const keep = keepIf ? keepIf(seen.length, dark / seen.length) : true;
    for (const p of seen) gone[p] = keep ? 1 : 3;
  };
  const edge: number[] = [];
  for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) edge.push(y * width, y * width + width - 1);
  flood([...new Set(edge)].filter((p) => bg[p]));
  // enclosed patches: only those big enough to hold a few squares of both greys
  const minArea = Math.max(64, Math.round(n * 0.002));
  for (let p = 0; p < n; p++) if (bg[p] && !gone[p]) flood([p], (area, dark) => area >= minArea && dark > 0.2 && dark < 0.8);

  let kept = 0;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  const alpha = Buffer.alloc(n);
  for (let p = 0; p < n; p++) {
    if (gone[p] === 1) continue;
    alpha[p] = 255;
    kept++;
    const x = p % width;
    const y = (p - x) / width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (kept < n * 0.03 || kept > n * 0.97) return null;
  // a slightly soft edge, so the cut does not look like a stencil
  const soft = await sharp(alpha, { raw: { width, height, channels: 1 } }).blur(0.7).extractChannel(0).raw().toBuffer();
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  const rgba = Buffer.alloc(n * 4);
  for (let p = 0; p < n; p++) {
    rgba[p * 4] = data[p * 3]!;
    rgba[p * 4 + 1] = data[p * 3 + 1]!;
    rgba[p * 4 + 2] = data[p * 3 + 2]!;
    rgba[p * 4 + 3] = soft[p]!;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: Math.min(width, x1 + pad + 1) - left, height: Math.min(height, y1 + pad + 1) - top })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Removes any background with rembg (a free, local model), for images without a checkerboard.
 * REMBG_BIN points to its command line; without it the button says the tool is missing.
 * One run holds about 800 MB with the default model (silueta), so the worker runs one at a time.
 */
export async function removeWithModel(img: Buffer): Promise<Buffer> {
  const bin = env().REMBG_BIN;
  if (!bin) throw new Error("Le détourage automatique n'est pas installé sur ce serveur (REMBG_BIN).");
  return withTemp(async (dir) => {
    const src = join(dir, "in.png");
    const out = join(dir, "out.png");
    // the model works at about 1000 px anyway: a smaller input is faster, for the same cut
    await writeFile(src, await sharp(img).resize({ width: 1024, height: 1280, fit: "inside", withoutEnlargement: true }).png().toBuffer());
    await run(bin, ["i", "-m", env().REMBG_MODEL, src, out], { timeout: 120_000 });
    const cut = await readFile(out);
    // a picture without a clear subject (a landscape, a texture) comes back nearly empty
    const alpha = await sharp(cut).ensureAlpha().extractChannel(3).raw().toBuffer();
    if (alpha.filter((v) => v > 128).length < alpha.length * 0.03) {
      throw new Error("Pas de sujet net à détourer dans cette image : garde l'original ou choisis-en une autre.");
    }
    // crop to what the model kept
    return sharp(cut).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer();
  });
}

/** The cut-out version of an image: the checkerboard when there is one, the model otherwise. */
export async function removeBackground(img: Buffer): Promise<Buffer> {
  if (await hasChecker(img)) {
    const cut = await removeChecker(img);
    if (cut) return cut;
  }
  return removeWithModel(img);
}
