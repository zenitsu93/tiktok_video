import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { pinSearches } from "./schema";

/** A search's key: its exact words, whatever the case or the spaces. */
export const pinKey = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ");

/** The pins a search already brought, or null when it was never paid for. */
export async function getPinSearch(db: Db, query: string): Promise<string[] | null> {
  const [r] = await db.select({ urls: pinSearches.urls }).from(pinSearches).where(eq(pinSearches.query, pinKey(query)));
  return r?.urls ?? null;
}

/** Keeps what a paid search brought; a search paid again adds its new pins after the old ones. */
export async function savePinSearch(db: Db, query: string, urls: string[]) {
  if (!urls.length) return;
  await db
    .insert(pinSearches)
    .values({ query: pinKey(query), urls })
    .onConflictDoUpdate({
      target: pinSearches.query,
      // each pin once, in the order it first came
      set: {
        urls: sql`(select jsonb_agg(u order by o) from (select u, min(o) as o from jsonb_array_elements_text(${pinSearches.urls} || excluded.urls) with ordinality as t(u, o) group by u) x)`,
      },
    });
}
