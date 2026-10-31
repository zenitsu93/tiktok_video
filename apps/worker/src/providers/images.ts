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

/** A Pinterest search that Apify could not run: says why in plain words, for Thomas. */
export class SearchError extends Error {}

/** The words of a search without what trips the actor up: quotes, punctuation, more than six words. */
export function plainQuery(query: string): string {
  return query
    .replace(/[^\p{L}\p{N}' -]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

/** Why a run failed, from Apify itself (its status message), so the error says more than « FAILED ». */
async function runReason(runId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const run = ((await res.json()) as { data?: { status?: string; statusMessage?: string; exitCode?: number } }).data;
    const log = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}/log`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    // the end of the actor's log goes to the worker's log: that is where the real cause is written
    if (log) console.warn(`[images] log du run Apify ${runId} :\n${log.split("\n").slice(-25).join("\n")}`);
    return run?.statusMessage?.trim() || null;
  } catch {
    return null;
  }
}

async function runActor(query: string, limit: number): Promise<unknown[]> {
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
  if (res.ok) return (await res.json()) as unknown[];
  const detail = (await res.text()).slice(0, 300);
  // the account's monthly spending cap: nothing will pass until it is raised or the month turns
  if (/usage hard limit|platform-feature-disabled|not-enough-usage|insufficient/i.test(detail)) {
    throw new BudgetError("Ton compte Apify a atteint sa limite de dépense du mois. Relève-la sur console.apify.com (Billing, Limits), puis clique sur « Reprendre ».");
  }
  if (res.status === 401 || res.status === 403) throw new SearchError("Apify refuse la clé de la Régie (APIFY_TOKEN) : elle a expiré ou a été changée.");
  const runId = /run ID: ([A-Za-z0-9]+)/.exec(detail)?.[1];
  if (runId) {
    const why = await runReason(runId, e.APIFY_TOKEN!);
    throw new SearchError(`La recherche Pinterest « ${query} » a planté chez Apify${why ? ` (${why})` : ""}.`);
  }
  if (/timed-out|TIMED-OUT/.test(detail) || res.status === 408) throw new SearchError(`La recherche Pinterest « ${query} » a mis trop de temps chez Apify.`);
  throw new SearchError(`Apify a répondu ${res.status} pour « ${query} » : ${detail}`);
}

/**
 * Pinterest search through the Apify actor; returns the best image URL of each pin.
 * The exact same words already searched (on any video) give their pins again, free, unless
 * this video has them all already (`skip`): then the search is paid for again.
 * A run that fails is tried once more, with plain words (no quotes or punctuation, six words
 * at most) when those differ: a failed run returns nothing, so it is not billed per pin.
 */
export async function searchPinterest(videoId: string, query: string, limit: number, skip: Set<string | undefined> = new Set()): Promise<string[]> {
  const saved = await getPinSearch(getDb(), query);
  if (saved?.some((u) => !skip.has(u))) {
    console.log(`[images] « ${query} » déjà cherché : ${saved.length} pins repris, pas d'appel Apify`);
    return saved;
  }
  await assertBudget(videoId);
  let items: unknown[];
  try {
    items = await runActor(query, limit);
  } catch (e) {
    if (!(e instanceof SearchError)) throw e;
    console.warn(`[images] ${e.message} Nouvel essai.`);
    items = await runActor(plainQuery(query) || query, limit);
  }
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
