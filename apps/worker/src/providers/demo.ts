import { demoBeats, type Beat } from "@regie/core";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ff, withTemp } from "../media";

/**
 * Stand-ins used while a key is missing, so the whole app can be tried end to end.
 * Everything they produce is marked as a demo in the app.
 */

export function demoScript(title: string, artist: string): { beats: Omit<Beat, "id" | "entrance" | "image" | "candidates" | "accent" | "reveal" | "voice" | "voiceText" | "gap">[]; sources: string[] } {
  if (/like a tattoo/i.test(title)) {
    return { beats: demoBeats().map(({ text, hero, layout, imageQuery }) => ({ text, hero, layout, imageQuery })), sources: [] };
  }
  const q = (s: string) => ({ kind: "pinterest" as const, queries: [s, `${s} aesthetic`] });
  return {
    sources: [],
    beats: [
      { text: "Tu connais l'histoire de", hero: "", layout: "vinyl", imageQuery: { kind: "none", queries: [] } },
      { text: `${title}, de ${artist} ?`, hero: title, layout: "vinyl", imageQuery: { kind: "none", queries: [] } },
      { text: "Je raconte l'histoire derrière vos chansons préférées,", hero: "", layout: "mascot", imageQuery: { kind: "none", queries: [] } },
      { text: "alors abonne-toi pour la suite,", hero: "abonne-toi", layout: "mascot", imageQuery: { kind: "none", queries: [] } },
      { text: "ça me soutient énormément.", hero: "énormément", layout: "mascot", imageQuery: { kind: "none", queries: [] } },
      { text: "Ceci est une vidéo de démonstration.", hero: "démonstration", layout: "card", imageQuery: q(`${artist} portrait`) },
      { text: "Ajoute ta clé Claude", hero: "Claude", layout: "text", imageQuery: { kind: "none", queries: [] } },
      { text: "pour écrire la vraie histoire.", hero: "histoire", layout: "card", imageQuery: q(`${title} ${artist}`) },
      { text: "Tu connaissais cette histoire ?", hero: "", layout: "vinyl", imageQuery: { kind: "none", queries: [] } },
    ],
  };
}

/** Without Claude, an edited demo script is cut at its punctuation into plain text shots. */
export function demoSplit(script: string): ReturnType<typeof demoScript>["beats"] {
  return script
    .split(/(?<=[.!?,;:])\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((text) => ({ text, hero: "", layout: "text" as const, imageQuery: { kind: "none" as const, queries: [] } }));
}

/** A silent clip as long as the sentence would take to say. */
export async function demoVoice(text: string): Promise<Buffer> {
  const seconds = Math.max(0.6, text.length / 15);
  return withTemp(async (dir) => {
    const out = join(dir, "v.mp3");
    await ff("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=1:sample_rate=44100:duration=${seconds.toFixed(2)}`, "-af", "volume=0.001", "-c:a", "libmp3lame", "-q:a", "6", out]);
    return readFile(out);
  });
}

/** Coloured placeholder cards, one hue per candidate, labelled with the search. */
export async function demoImages(query: string, count: number, seed: number): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (seed * 47 + i * 61) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${i % 2 ? 800 : 1000}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,30%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,62%)"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="40" y="90%" font-family="sans-serif" font-size="34" fill="rgba(255,255,255,.85)">${query.replace(/[<&>]/g, "").slice(0, 40)} · ${i + 1}</text></svg>`;
    out.push(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
  }
  return out;
}

export function demoCaption(title: string, artist: string): string {
  const tag = (s: string) => s.normalize("NFD").replace(/[^A-Za-z0-9]/g, "");
  return `Tu connais l'histoire de ${title} ? Légende de démonstration : ajoute ta clé Claude pour la vraie.\n#${tag(artist)} #${tag(title)} #histoire`;
}
