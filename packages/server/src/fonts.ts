import { FONT_WEIGHTS, ITALIC_WEIGHTS, type FontName } from "@regie/core";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The video font. Kaneda Gothic lives in brand/fonts/kaneda/ (committed: the
 * repository is private and the font is not free). If a weight is missing,
 * videos fall back to Oswald (bundled, SIL OFL).
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
  /** Absolute path of the file for each weight ("300i" and "700i" for the italics). */
  files: Record<string, string>;
}

export function fontsDir(): string {
  return process.env.FONTS_DIR ?? resolve(process.cwd(), "../../brand/fonts");
}

let cached: BrandFonts | undefined;

export function brandFonts(dir = fontsDir()): BrandFonts {
  if (cached && dir === fontsDir()) return cached;
  const kdir = join(dir, "kaneda");
  const found: Record<string, string> = {};
  const italics: Record<string, string> = {};
  if (existsSync(kdir)) {
    const all = readdirSync(kdir).filter((f) => /\.(otf|ttf|woff2?)$/i.test(f));
    const files = all.filter((f) => !/italic/i.test(f));
    for (const w of FONT_WEIGHTS) {
      const f = files.find((x) => KANEDA[w].test(x));
      if (f) found[w] = join(kdir, f);
    }
    for (const w of ITALIC_WEIGHTS) {
      const f = all.find((x) => /italic/i.test(x) && KANEDA[w].test(x));
      if (f) italics[`${w}i`] = join(kdir, f);
    }
  }
  const result: BrandFonts =
    Object.keys(found).length === FONT_WEIGHTS.length
      ? { name: "kaneda", files: { ...found, ...italics } }
      : { name: "oswald", files: Object.fromEntries(FONT_WEIGHTS.map((w) => [w, join(dir, `oswald-${w}.woff2`)])) };
  if (dir === fontsDir()) cached = result;
  return result;
}
