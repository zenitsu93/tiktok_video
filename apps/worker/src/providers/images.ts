import { getDb, getPinSearch, recordUsage, savePinSearch } from "@regie/db";
import { assertBudget, BudgetError, env, PRICES } from "@regie/server";

/**
 * Image downloads only go to these hosts, over HTTPS, with a size cap.
 * A URL found in a scraped result can never make the worker call anything else.
 */
const ALLOWED_HOSTS = [/^i\.pinimg\.com$/, /^([a-z0-9-]+\.)?dzcdn\.net$/];
const MAX_BYTES = 15 * 1024 * 1024;

export function allowedImageUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  return ALLOWED_HOSTS.some((h) => h.test(u.hostname)) ? u : null;
}

export async function fetchImage(raw: string): Promise<Buffer> {
  let url = allowedImageUrl(raw);
  for (let hop = 0; hop < 3 && url; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { accept: "image/*" } });
    if (res.status >= 300 && res.status < 400) {
      url = allowedImageUrl(new URL(res.headers.get("location") ?? "", url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`image ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`type refusé : ${type}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("image trop lourde");
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error("image trop lourde");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("adresse d'image refusée");
}

/** Finds the largest pinimg URL anywhere in a scraped item, whatever the actor's field names. */
export function pinUrls(item: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 5 || v == null) return;
    if (typeof v === "string") {
      if (/^https:\/\/i\.pinimg\.com\//.test(v)) found.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => walk(x, depth + 1));
  };
  walk(item, 0);
  const rank = (u: string) => (u.includes("/originals/") ? 4000 : Number(/\/(\d+)x\//.exec(u)?.[1] ?? 0));
  return [...new Set(found)].sort((a, b) => rank(b) - rank(a));
}

/**
 * Pinterest search through the Apify actor; returns the best image URL of each pin.
 * The exact same words already searched (on any video) give their pins again, free, unless
 * this video has them all already (`skip`): then the search is paid for again.
 */
export async function searchPinterest(videoId: string, query: string, limit: number, skip: Set<string | undefined> = new Set()): Promise<string[]> {
  const saved = await getPinSearch(getDb(), query);
  if (saved?.some((u) => !skip.has(u))) {
    console.log(`[images] « ${query} » déjà cherché : ${saved.length} pins repris, pas d'appel Apify`);
    return saved;
  }
  await assertBudget(videoId);
  const e = env();
  const res = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(e.APIFY_PINTEREST_ACTOR)}/run-sync-get-dataset-items?timeout=120&clean=true`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${e.APIFY_TOKEN}`, "content-type": "application/json" },
      // maxPins is the actor's only limit; without it every search bills 50 pins
      body: JSON.stringify({ searchQueries: [query], maxPins: limit }),
      signal: AbortSignal.timeout(150_000),
    },
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    // the account's monthly spending cap: nothing will pass until it is raised or the month turns
    if (/usage hard limit|platform-feature-disabled/i.test(detail)) {
      throw new BudgetError("Ton compte Apify a atteint sa limite de dépense du mois. Relève-la sur console.apify.com (Billing, Limits), puis clique sur « Reprendre ».");
    }
    throw new Error(`Apify a répondu ${res.status} : ${detail}`);
  }
  const items = (await res.json()) as unknown[];
  await recordUsage(getDb(), {
    videoId,
    provider: "apify",
    operation: "recherche Pinterest",
    units: { results: items.length },
    costUsd: (items.length * PRICES.apifyPerResult).toFixed(5),
  });
  const urls = items.map((it) => pinUrls(it)[0]).filter((u): u is string => Boolean(u));
  await savePinSearch(getDb(), query, urls);
  return urls;
}

/** Cover of the single or album from Deezer's public API (no key), 1000 px: exact track first, then a looser search. */
export async function deezerCover(title: string, artist: string): Promise<string | null> {
  for (const q of [`artist:"${artist}" track:"${title}"`, `${artist} ${title}`]) {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) continue;
    const body = (await res.json()) as { data?: { album?: { cover_xl?: string } }[] };
    const url = body.data?.[0]?.album?.cover_xl ?? null;
    if (url && allowedImageUrl(url)) return url;
  }
  return null;
}
