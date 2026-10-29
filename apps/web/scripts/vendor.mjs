// Copies what the preview frame and the browser need into public/: GSAP, the fonts and the brand icons.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = resolve(web, "../../brand");
const pub = join(web, "public");
const vendor = join(pub, "vendor");

mkdirSync(join(vendor, "fonts"), { recursive: true });
cpSync(require.resolve("gsap/dist/gsap.min.js"), join(vendor, "gsap.min.js"));
cpSync(require.resolve("gsap/dist/CustomEase.min.js"), join(vendor, "CustomEase.min.js"));
// the app itself is in Oswald
const WEIGHTS = [200, 300, 400, 600, 700];
for (const w of WEIGHTS) cpSync(join(brand, "fonts", `oswald-${w}.woff2`), join(vendor, "fonts", `oswald-${w}.woff2`));

// the videos (and so the preview) use Kaneda Gothic when its files are in brand/fonts/kaneda/,
// with the same matching as brandFonts() in @regie/server
const KANEDA = { 200: /extra[\s_-]?light/i, 300: /(?<!extra[\s_-]?)light/i, 400: /regular/i, 600: /(?<!extra[\s_-]?)bold/i, 700: /black/i };
const kdir = join(brand, "fonts", "kaneda");
const kfiles = existsSync(kdir) ? readdirSync(kdir).filter((f) => /\.(otf|ttf|woff2?)$/i.test(f) && !/italic/i.test(f)) : [];
const kaneda = Object.fromEntries(WEIGHTS.map((w) => [w, kfiles.find((f) => KANEDA[w].test(f))]));
const useKaneda = WEIGHTS.every((w) => kaneda[w]);
for (const w of WEIGHTS) {
  const src = useKaneda ? join(kdir, kaneda[w]) : join(brand, "fonts", `oswald-${w}.woff2`);
  cpSync(src, join(vendor, "fonts", `brand-${w}.font`));
}

const icons = join(brand, "icones");
for (const f of ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) cpSync(join(icons, f), join(pub, f));
cpSync(join(brand, "reseaux", "og-regie.png"), join(pub, "og.png"));
cpSync(join(brand, "logo", "thomas-avatar.svg"), join(pub, "logo.svg"));
console.log(`[vendor] gsap, icônes et police des vidéos (${useKaneda ? "Kaneda Gothic" : "Oswald, Kaneda absente"}) copiés dans public/`);
