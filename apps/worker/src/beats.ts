import { ENTRANCES, FPS, type Beat, type Entrance, type Move, type Place, type VideoDoc, type Zone } from "@regie/core";

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

/** A small seeded random generator (mulberry32): the same seed always draws the same video. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks from weighted choices. */
const weighted = <T>(rand: () => number, items: [T, number][]): T => {
  let x = rand() * items.reduce((s, [, w]) => s + w, 0);
  for (const [it, w] of items) if ((x -= w) < 0) return it;
  return items.at(-1)![0];
};

/**
 * The video's own language, drawn from its seed: where its text likes to sit around the pictures,
 * how its pictures zoom, how its ideas end, and the order its entrances turn in. Thomas varies all of
 * these from one video to the next; the skill's rules keep each video coherent inside.
 */
export interface Style {
  zones: [Zone, number][];
  zoom: NonNullable<NonNullable<VideoDoc["look"]>["zoom"]>;
  exit: NonNullable<NonNullable<VideoDoc["look"]>["exit"]>;
  entrances: Entrance[];
}

const PROFILES: [Zone, number][][] = [
  // classic: under the card, sometimes above
  [["under", 6], ["above", 2], ["underright", 1], ["aboveright", 1]],
  // high: the text mostly rides above the pictures
  [["above", 5], ["under", 3], ["aboveright", 2]],
  // right: blocks aligned on the right edge
  [["underright", 4], ["aboveright", 3], ["under", 2], ["above", 1]],
  // mixed: every zone in turn
  [["under", 3], ["above", 3], ["underright", 2], ["aboveright", 2]],
];

export function drawStyle(seed: number): Style {
  const rand = rng(seed);
  const entrances = [...ENTRANCES];
  for (let i = entrances.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [entrances[i], entrances[j]] = [entrances[j]!, entrances[i]!];
  }
  return {
    zones: PROFILES[Math.floor(rand() * PROFILES.length)]!,
    zoom: weighted(rand, [["alt", 4], ["in", 2], ["out", 2], ["push", 2]]),
    exit: weighted(rand, [["mix", 4], ["point", 2], ["cut", 2]]),
    entrances,
  };
}

/**
 * How each line places and stresses its text, from its shape and the video's style:
 * a text-only line goes to the centre or one of the four corners (never the same spot twice in a row),
 * the text around a picture follows the video's zones (never the same off-default zone twice in a row),
 * a hero of several words reads small + big, a long line without a strong word stresses it inline,
 * and about one picture in five sits beside its text (portrait pictures only, the layout falls back otherwise).
 */
export function pickPlaces(rows: Row[], seed: number, style = drawStyle(seed)): { places: Place[]; zones: Zone[] } {
  const rand = rng(seed ^ 0x5bd1e995);
  const spots: Place[] = ["hero", "topright", "bottomleft", "topleft", "bottomright"];
  let lastSpot: Place = "bottomleft";
  let lastZone: Zone = "under";
  let zone: Zone = "under";
  let ideas = seed % 5;
  const places: Place[] = [];
  const zones: Zone[] = [];
  rows.forEach((row, i) => {
    let place: Place = "hero";
    if (row.layout === "text") {
      // the centre one time in two, a corner otherwise
      do place = rand() < 0.45 ? "hero" : spots[1 + Math.floor(rand() * 4)]!;
      while (place === lastSpot);
      lastSpot = place;
    } else if (row.layout === "card") {
      const heroWords = row.hero.trim() ? row.hero.trim().split(/\s+/).length : 0;
      const first = !sameQuery(rows[i - 1], row);
      if (first) {
        // the zone holds for the whole picture, so its lines do not jump around it
        do zone = weighted(rand, style.zones);
        while (zone !== "under" && zone === lastZone);
        lastZone = zone;
      }
      if (first && ideas++ % 5 === 0 && words(row.text) <= 6) place = "side";
      else if (heroWords >= 2) place = "size";
      else if (words(row.text) >= 6 && !row.italic) place = "inline";
    }
    places.push(place);
    zones.push(row.layout === "card" ? zone : "under");
  });
  return { places, zones };
}

/** Beats from the split, with the montage skill's variations already chosen. `seed` makes the video its own. */
export function toBeats(split: Row[], seed = 0): Beat[] {
  const rows = balanceRows(split);
  const moves = pickMoves(rows);
  // seed 0 keeps the skill's own order; any other seed turns the entrances in the video's own order
  const style = drawStyle(seed);
  const order = seed === 0 ? [...ENTRANCES] : style.entrances;
  const { places, zones } = pickPlaces(rows, seed, style);
  let r = seed % order.length;
  let lines = seed % 3;
  let pictures = seed % 4;
  let lastItalic = -9;
  return rows.map((row, i) => {
    const sameIdea = sameQuery(rows[i - 1], row);
    const visual = row.layout === "card" || row.layout === "cutout";
    if (visual && !sameIdea) r = (r + 1) % order.length;
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
      entrance: visual ? order[r]! : "pop",
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
      zone: zones[i]!,
    };
  });
}
