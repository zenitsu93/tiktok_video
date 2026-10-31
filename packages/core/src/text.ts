/**
 * Punctuation that must never stand alone on screen. French puts a space before « : ; ? ! » »
 * and after « « », so a plain split on spaces leaves « : » or « » » as a word of its own that
 * can wrap to a line by itself. These helpers keep every mark glued to its word, and keep the
 * quotes of a line paired.
 */

/** No-break space: what glues a mark to its word, and what a line never breaks on. */
export const NBSP = " ";

const CLOSING = /^[,.;:?!…»”’)\]]+$/;
const OPENING = /^[«“‘(\[]+$/;
/** Spaces a line may break on: every white space but the no-break ones. */
const BREAKABLE = /[^\S  ]+/;

/**
 * The words of a line as they show on screen: a mark alone (« : », « ? », « » », « « », a lone `"`)
 * is joined to its neighbour with a no-break space, so it can never start or end a line by itself.
 */
export function textWords(text: string): string[] {
  const raw = text.trim().split(BREAKABLE).filter(Boolean);
  const out: string[] = [];
  let pendingOpen = "";
  let straight = 0;
  for (const tok of raw) {
    let isClosing = CLOSING.test(tok);
    let isOpening = OPENING.test(tok);
    if (/^"+$/.test(tok)) {
      // a lone straight quote: it closes when an odd number came before it
      isClosing = straight % 2 === 1;
      isOpening = !isClosing;
    }
    straight += (tok.match(/"/g) ?? []).length;
    if (isClosing && !pendingOpen && out.length) {
      out[out.length - 1] += NBSP + tok;
      continue;
    }
    if (isOpening) {
      pendingOpen += (pendingOpen ? NBSP : "") + tok;
      continue;
    }
    out.push(pendingOpen ? pendingOpen + NBSP + tok : tok);
    pendingOpen = "";
  }
  if (pendingOpen) {
    if (out.length) out[out.length - 1] += NBSP + pendingOpen;
    else out.push(pendingOpen);
  }
  return out;
}

type Pair = { open: string; close: string };
const PAIRS: Pair[] = [
  { open: "«", close: "»" },
  { open: "“", close: "”" },
];

/** Straight quotes: paired when even; otherwise +1 if the first one opens a word, -1 if it ends one. */
function straightBalance(text: string): number {
  const n = (text.match(/"/g) ?? []).length;
  if (n % 2 === 0) return 0;
  const i = text.indexOf('"');
  const before = i === 0 ? " " : text[i - 1]!;
  return /[\s(«“]/.test(before) ? 1 : -1;
}

/**
 * How a line's quotes stand: +1 when it opens a quote it does not close, -1 when it closes one
 * it did not open, 0 when its quotes are paired. One entry per kind of quote.
 */
export function quoteBalance(text: string): (Pair & { balance: number })[] {
  const out = PAIRS.map((pair) => {
    let depth = 0;
    let unopened = 0;
    for (const c of text) {
      if (c === pair.open) depth++;
      else if (c === pair.close) {
        if (depth > 0) depth--;
        else unopened++;
      }
    }
    return { ...pair, balance: depth > 0 ? 1 : unopened > 0 ? -1 : 0 };
  });
  out.push({ open: '"', close: '"', balance: straightBalance(text) });
  return out;
}

const TRAILING = /[\s,.;:?!…]*$/;

/** Closes an open quote before the line's final punctuation (« … What About Us. » becomes « … What About Us ». »). */
export function closeQuote(text: string, close: string): string {
  const t = text.trim();
  const tail = TRAILING.exec(t)?.[0] ?? "";
  const body = t.slice(0, t.length - tail.length);
  const space = close === "»" ? NBSP : "";
  return `${body}${space}${close}${tail.trim()}`;
}

/** Opens a quote at the start of a line that only closes one. */
export function openQuote(text: string, open: string): string {
  return `${open}${open === "«" ? NBSP : ""}${text.trim()}`;
}
