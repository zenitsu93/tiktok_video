// Copies what the preview frame and the browser need into public/: GSAP, Oswald and the brand icons.
import { cpSync, mkdirSync } from "node:fs";
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
for (const w of [200, 300, 400, 600, 700]) cpSync(join(brand, "fonts", `oswald-${w}.woff2`), join(vendor, "fonts", `oswald-${w}.woff2`));

const icons = join(brand, "icones");
for (const f of ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) cpSync(join(icons, f), join(pub, f));
cpSync(join(brand, "reseaux", "og-regie.png"), join(pub, "og.png"));
cpSync(join(brand, "logo", "thomas-avatar.svg"), join(pub, "logo.svg"));
console.log("[vendor] gsap, Oswald et icônes copiés dans public/");
