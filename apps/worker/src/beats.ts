import { ENTRANCES, FPS, type Beat } from "@regie/core";

/** One passage as the split returns it. */
export interface Row {
  text: string;
  hero: string;
  layout: Beat["layout"];
  imageQuery: Beat["imageQuery"];
  italic?: boolean;
}

const NO_IMAGE: Beat["imageQuery"] = { kind: "none", queries: [] };
const imageless = (r: Row) => r.layout === "text" || r.layout === "kinetic";
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Safety net for the rhythm, whatever the split returned: two imageless passages of
 * one sentence become one (a wall of text loses the viewer), a long imageless line
 * becomes a kinetic block, and a "kinetic" too short to fill its lines goes back to text.
 */
export function balanceRows(rows: Row[]): Row[] {
  const joined: Row[] = [];
  for (const row of rows) {
    const prev = joined.at(-1);
    if (prev && imageless(prev) && imageless(row) && !/[.?!…»"]$/.test(prev.text.trim())) {
      joined[joined.length - 1] = {
        text: `${prev.text.trim()} ${row.text.trim()}`,
        hero: row.hero || prev.hero,
        layout: "text",
        imageQuery: NO_IMAGE,
        italic: Boolean(prev.italic || row.italic),
      };
    } else joined.push(row);
  }
  return joined.map((r) => {
    if (!imageless(r)) return r;
    const n = words(r.text);
    return { ...r, layout: n >= 8 ? "kinetic" : n < 6 ? "text" : r.layout, imageQuery: NO_IMAGE };
  });
}

/**
 * Where to cut one take of the script (the beat texts joined by spaces) into a clip per
 * beat, in frames: halfway through the pause between a beat's last letter and the next
 * beat's first. The clips laid end to end give the take back without a seam.
 */
export function takeCuts(texts: string[], starts: number[], ends: number[], takeSeconds: number): number[] {
  const cuts = [Math.max(0, Math.floor((starts[0]! - 0.1) * FPS))];
  let pos = 0;
  for (const t of texts.slice(0, -1)) {
    const last = pos + t.length - 1;
    pos += t.length + 1;
    cuts.push(Math.round(((ends[last]! + starts[pos]!) / 2) * FPS));
  }
  cuts.push(Math.ceil(takeSeconds * FPS));
  // every clip lasts at least one frame
  for (let i = 1; i < cuts.length; i++) cuts[i] = Math.max(cuts[i]!, cuts[i - 1]! + 1);
  return cuts;
}

/** Beats from the split, with the montage skill's variations already chosen. */
export function toBeats(split: Row[]): Beat[] {
  const rows = balanceRows(split);
  let r = 0;
  let lines = 0;
  let lastItalic = -9;
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    const sameIdea = prev && prev.imageQuery.queries.join() === row.imageQuery.queries.join() && row.imageQuery.kind !== "none";
    const visual = row.layout === "card" || row.layout === "cutout";
    if (visual && !sameIdea) r = (r + 1) % ENTRANCES.length;
    // italics stay rare: never two in a row, never on the subscribe lines
    const italic = Boolean(row.italic) && row.layout !== "mascot" && i - lastItalic > 1;
    if (italic) lastItalic = i;
    // about one line in three turns from grey to black instead of typing letter by letter
    const plain = visual || row.layout === "text";
    if (plain) lines++;
    return {
      id: `b${String(i + 1).padStart(2, "0")}`,
      text: row.text.trim(),
      hero: row.hero && row.text.toLowerCase().includes(row.hero.toLowerCase()) ? row.hero : "",
      layout: row.layout,
      entrance: visual ? ENTRANCES[r]! : "pop",
      image: null,
      candidates: [],
      imageQuery: row.imageQuery,
      accent: i % 4 === 2,
      reveal: plain && lines % 3 === 0 ? "fade" : "type",
      voice: null,
      voiceText: null,
      gap: /[.?!…]$/.test(row.text.trim()) ? 0.35 : 0.08,
      italic,
    };
  });
}
