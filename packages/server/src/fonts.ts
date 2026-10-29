import { FONT_WEIGHTS, type FontName } from "@regie/core";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The video font. Kaneda Gothic is not free, so its files never go in the
 * repository: drop them in brand/fonts/kaneda/ (ignored by git) and the videos
 * use them. Without them, videos fall back to Oswald (bundled, SIL OFL).
 */
const KANEDA: Record<(typeof FONT_WEIGHTS)[number], RegExp> = {
  200: /extra[\s_-]?light/i,
  300: /(?<!extra[\s_-]?)light/i,
  400: /regular/i,
  600: /(?<!extra[\s_-]?)bold/i,
  700: /black/i,
};

export interface BrandFonts {
  name: FontName;
  /** Absolute path of the file for each weight. */
  files: Record<number, string>;
}

export function fontsDir(): string {
  return process.env.FONTS_DIR ?? resolve(process.cwd(), "../../brand/fonts");
}

let cached: BrandFonts | undefined;

export function brandFonts(dir = fontsDir()): BrandFonts {
  if (cached && dir === fontsDir()) return cached;
  const kdir = join(dir, "kaneda");
  const found: Record<number, string> = {};
  if (existsSync(kdir)) {
    const files = readdirSync(kdir).filter((f) => /\.(otf|ttf|woff2?)$/i.test(f) && !/italic/i.test(f));
    for (const w of FONT_WEIGHTS) {
      const f = files.find((x) => KANEDA[w].test(x));
      if (f) found[w] = join(kdir, f);
    }
  }
  const result: BrandFonts =
    Object.keys(found).length === FONT_WEIGHTS.length
      ? { name: "kaneda", files: found }
      : { name: "oswald", files: Object.fromEntries(FONT_WEIGHTS.map((w) => [w, join(dir, `oswald-${w}.woff2`)])) };
  if (dir === fontsDir()) cached = result;
  return result;
}
