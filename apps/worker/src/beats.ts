import { ENTRANCES, FPS, type Beat, type Move, type Place } from "@regie/core";

/** One passage as the split returns it. */
export interface Row {
  text: string;
  hero: string;
  layout: Beat["layout"];
  imageQuery: Beat["imageQuery"];
  italic?: boolean;
  /** Gesture Claude read in the sentence (« tombe », « secret »…), checked by toBeats. */
  move?: Move | null;
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

/** Where a move may go: the layouts it needs. */
const MOVE_LAYOUTS: Record<Exclude<Move, "none">, Beat["layout"][]> = {
  fall: ["card", "cutout"],
  shatter: ["card"],
  mystery: ["card"],
  fullscreen: ["card"],
  evaporate: ["card"],
  ghost: ["cutout"],
};
/** Lines between two gestures: a gesture stays an event. */
const MOVE_SPACING = 4;

const sameQuery = (a: Row | undefined, b: Row | undefined) =>
  Boolean(a && b && a.imageQuery.kind !== "none" && a.imageQuery.queries.join() === b.imageQuery.queries.join());

/**
 * The gestures kept from Claude's reading: on a layout that can play them, spaced out,
 * never the same twice in a row, one full screen per video. A gesture that ends the card
 * (falls, breaks, fades away) only on the last line of its picture. When the reading gave
 * fewer than two, the card fades into the white at one or two chapter ends (before a text-only line).
 */
export function pickMoves(rows: Row[]): Move[] {
  const moves: Move[] = rows.map(() => "none");
  let last = -99;
  let lastMove: Move = "none";
  let full = false;
  const ends = (i: number) => !sameQuery(rows[i], rows[i + 1]);
  const free = (i: number, m: Move) => i - last >= MOVE_SPACING && m !== lastMove;
  rows.forEach((row, i) => {
    const m = row.move ?? "none";
    if (m === "none" || !MOVE_LAYOUTS[m].includes(row.layout)) return;
    if ((m === "fall" || m === "shatter" || m === "evaporate") && !ends(i)) return;
    if (m === "fullscreen" && full) return;
    if (!free(i, m)) return;
    moves[i] = m;
    last = i;
    lastMove = m;
    if (m === "fullscreen") full = true;
  });
  let added = moves.filter((m) => m !== "none").length;
  rows.forEach((row, i) => {
    if (added >= 2 || row.layout !== "card" || !ends(i) || moves[i] !== "none") return;
    const next = rows[i + 1];
    if (!next || (next.layout !== "text" && next.layout !== "kinetic")) return;
    if (moves.some((m, j) => m !== "none" && Math.abs(j - i) < MOVE_SPACING)) return;
    moves[i] = "evaporate";
    added++;
  });
  return moves;
}

/**
 * How each line places and stresses its text, from its shape and the video's seed:
 * a text-only line leaves the centre for a corner one time in two (never the same corner twice),
 * a hero of several words reads small + big, a long line without a strong word stresses it inline,
 * and about one picture in five sits beside its text (portrait pictures only, the layout falls back otherwise).
 */
export function pickPlaces(rows: Row[], seed: number): Place[] {
  let texts = seed % 2;
  let corner = (seed >> 1) % 2;
  let ideas = seed % 5;
  return rows.map((row, i) => {
    if (row.layout === "text") {
      if (texts++ % 2 === 0) return "hero";
      corner++;
      return corner % 2 ? "topright" : "bottomleft";
    }
    if (row.layout !== "card") return "hero";
    const heroWords = row.hero.trim() ? row.hero.trim().split(/\s+/).length : 0;
    const first = !sameQuery(rows[i - 1], row);
    if (first && ideas++ % 5 === 0 && words(row.text) <= 6) return "side";
    if (heroWords >= 2) return "size";
    if (words(row.text) >= 6 && !row.italic) return "inline";
    return "hero";
  });
}

/** Beats from the split, with the montage skill's variations already chosen. `seed` makes the video its own. */
export function toBeats(split: Row[], seed = 0): Beat[] {
  const rows = balanceRows(split);
  const moves = pickMoves(rows);
  const places = pickPlaces(rows, seed);
  // the entrances turn from a point of the cycle that changes with each video
  let r = seed % ENTRANCES.length;
  let lines = seed % 3;
  let pictures = seed % 4;
  let lastItalic = -9;
  return rows.map((row, i) => {
    const sameIdea = sameQuery(rows[i - 1], row);
    const visual = row.layout === "card" || row.layout === "cutout";
    if (visual && !sameIdea) r = (r + 1) % ENTRANCES.length;
    // italics stay rare: never two in a row, never on the subscribe lines
    const italic = Boolean(row.italic) && row.layout !== "mascot" && i - lastItalic > 1;
    if (italic) lastItalic = i;
    // about one line in three turns from grey to black instead of typing letter by letter
    const plain = visual || row.layout === "text";
    if (plain) lines++;
    // the image colour on the hero, about one picture line in four (only there does it show)
    const accent = visual && Boolean(row.hero) && pictures++ % 4 === 3;
    return {
      id: `b${String(i + 1).padStart(2, "0")}`,
      text: row.text.trim(),
      hero: row.hero && row.text.toLowerCase().includes(row.hero.toLowerCase()) ? row.hero : "",
      layout: row.layout,
      entrance: visual ? ENTRANCES[r]! : "pop",
      image: null,
      candidates: [],
      imageQuery: row.imageQuery,
      accent,
      reveal: plain && lines % 3 === 0 ? "fade" : "type",
      voice: null,
      voiceText: null,
      gap: /[.?!…]$/.test(row.text.trim()) ? 0.35 : 0.08,
      italic,
      move: moves[i]!,
      place: places[i]!,
    };
  });
}
