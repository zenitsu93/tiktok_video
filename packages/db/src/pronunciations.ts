import { asc, sql } from "drizzle-orm";
import type { Db } from "./index";
import { pronunciations } from "./schema";

export async function listPronunciations(db: Db): Promise<{ word: string; say: string }[]> {
  return db.select({ word: pronunciations.word, say: pronunciations.say }).from(pronunciations).orderBy(asc(sql`lower(${pronunciations.word})`));
}

/** The lexicon the voice reads with: word → how to say it. */
export async function pronunciationLexicon(db: Db): Promise<Record<string, string>> {
  return Object.fromEntries((await listPronunciations(db)).map((p) => [p.word, p.say]));
}

/** Adds or replaces a word; « sade » replaces « Sade ». */
export async function savePronunciation(db: Db, word: string, say: string) {
  await db.transaction(async (tx) => {
    await tx.delete(pronunciations).where(sql`lower(${pronunciations.word}) = lower(${word})`);
    await tx.insert(pronunciations).values({ word, say });
  });
}

export async function deletePronunciation(db: Db, word: string) {
  await db.delete(pronunciations).where(sql`lower(${pronunciations.word}) = lower(${word})`);
}
