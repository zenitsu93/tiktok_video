// Rasterises the brand SVGs into PNG, ICO, GIF and MP4.
// Needs Playwright (Chromium) and ffmpeg: `node brand/scripts/build-brand.mjs`.
// The SVG sources in brand/logo, brand/anime and brand/icones are the masters.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const B = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = (p) => readFileSync(join(B, p), "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "");
const sized = (s, w, h) => s.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`);
const font = (w) => `data:font/woff2;base64,${readFileSync(join(B, "fonts", `oswald-${w}.woff2`)).toString("base64")}`;
const FONTS = [200, 300, 400, 700]
  .map((w) => `@font-face{font-family:Oswald;font-weight:${w};src:url("${font(w)}") format("woff2")}`)
  .join("");

const browser = await chromium.launch();

async function shot(html, out, w, h, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<!doctype html><html><head><style>${FONTS}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${transparent ? "transparent" : "#fff"}}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(B, out), omitBackground: transparent });
  await page.close();
}

// ---- static logos
await shot(sized(svg("logo/thomas-logo.svg"), 2560, 743), "logo/thomas-logo.png", 2560, 743, true);
await shot(sized(svg("logo/thomas-logo-fond-sombre.svg"), 2560, 743), "logo/thomas-logo-fond-sombre.png", 2560, 743, true);
await shot(sized(svg("logo/thomas-avatar.svg"), 1080, 1080), "logo/thomas-avatar-tiktok.png", 1080, 1080);

// ---- icons
for (const [n, s] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180], ["favicon-32.png", 32], ["favicon-16.png", 16], ["favicon-48.png", 48]]) {
  const src = n.startsWith("apple") ? svg("logo/thomas-avatar.svg") : svg("icones/favicon.svg");
  await shot(sized(src, s, s), `icones/${n}`, s, s, !n.startsWith("apple"));
}
await shot(sized(svg("icones/icon-maskable.svg"), 512, 512), "icones/icon-maskable-512.png", 512, 512);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(B, "icones/favicon-48.png"), "-i", join(B, "icones/favicon-32.png"), "-i", join(B, "icones/favicon-16.png"), "-map", "0", "-map", "1", "-map", "2", join(B, "icones/favicon.ico")]);

// ---- social previews and GitHub cover
const logo = (w) => sized(svg("logo/thomas-logo.svg"), w, Math.round((w * 743) / 2560));
const card = (w, h, eyebrow, title, line) => `
<div style="width:${w}px;height:${h}px;box-sizing:border-box;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;font-family:Oswald;color:#141210;background:#fff;position:relative;overflow:hidden">
  <div style="font-weight:400;font-size:24px;letter-spacing:.14em;text-transform:uppercase;color:#6c655b">${eyebrow}</div>
  <div style="display:flex;flex-direction:column;gap:18px">${logo(620)}
    <div style="font-size:64px;line-height:1;font-weight:200">${title}</div></div>
  <div style="font-size:30px;font-weight:300;color:#3d3832">${line}</div>
  <div style="position:absolute;right:-170px;bottom:-170px;width:520px;height:520px;border-radius:50%;background:repeating-radial-gradient(circle,#141210 0 9px,#232120 9px 12px)"></div>
  <div style="position:absolute;right:-5px;bottom:-5px;width:190px;height:190px;border-radius:50%;background:#d6381c"></div>
</div>`;
await shot(card(1200, 630, "@thomasthbdl", "L'histoire derrière vos <b style='font-weight:700'>chansons</b> préférées", "Une chanson, une anecdote, une minute."), "reseaux/og-thomas.png", 1200, 630);
await shot(card(1200, 630, "Régie · studio privé", "De la chanson à la <b style='font-weight:700'>vidéo</b>", "Script, voix, images et montage, plan par plan."), "reseaux/og-regie.png", 1200, 630);
await shot(card(1280, 640, "github.com/zenitsu93/tiktok_video", "Régie, la <b style='font-weight:700'>fabrique</b> à TikTok", "Tu entres la chanson, tu récupères la vidéo montée."), "reseaux/github-cover.png", 1280, 640);

// ---- animated logo: frames from the CSS animation, then MP4 and GIF
const tmp = join(tmpdir(), "brand-frames");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff;width:1920px;height:1080px;display:flex;align-items:center;justify-content:center">${sized(svg("anime/thomas-logo-anime.svg"), 1500, 435)}</body></html>`);
const FPS = 30;
const SECONDS = 3.4;
for (let f = 0; f < FPS * SECONDS; f++) {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, (f * 1000) / FPS);
  await page.screenshot({ path: join(tmp, `f${String(f).padStart(4, "0")}.png`) });
}
await page.close();
await browser.close();
const frames = join(tmp, "f%04d.png");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", frames, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", join(B, "anime/thomas-logo-anime.mp4")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", frames, "-vf", "fps=20,crop=1560:500:180:290,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse", join(B, "anime/thomas-logo-anime.gif")]);
writeFileSync(join(tmp, "done"), "");
console.log("brand built");
