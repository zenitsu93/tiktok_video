import { voiceStale } from "@regie/core";
import { deletePronunciation, getDb, getVideo, pronunciationLexicon, savePronunciation } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { body, route, videoId } from "@/lib/http";

const word = z.string().trim().min(1).max(60);
const add = z.object({ word, say: z.string().trim().min(1).max(120), videoId: z.string().optional() }).strict();
const remove = z.object({ word, videoId: z.string().optional() }).strict();

/**
 * In the video being edited, the lines whose reading just changed get their voice redone
 * at once (a few characters each). Lines not voiced yet get it with the rest of the pipeline.
 */
async function revoice(id: string | undefined): Promise<number> {
  if (!id) return 0;
  const db = getDb();
  const row = await getVideo(db, videoId(id));
  if (!row || row.status === "generating") return 0;
  const lexicon = await pronunciationLexicon(db);
  const lines = row.doc.beats.filter((b) => b.voice && voiceStale(b, lexicon));
  for (const b of lines) await enqueue(JOBS.voice, { videoId: row.id, beatId: b.id });
  return lines.length;
}

/** The pronunciation lexicon, shared by every video: « Sade » shown, « Chadé » said. Adds or replaces a word. */
export const POST = route(async (req: NextRequest) => {
  const data = add.parse(await body(req));
  await savePronunciation(getDb(), data.word, data.say);
  return NextResponse.json({ revoiced: await revoice(data.videoId) });
});

export const DELETE = route(async (req: NextRequest) => {
  const data = remove.parse(await body(req));
  await deletePronunciation(getDb(), data.word);
  return NextResponse.json({ revoiced: await revoice(data.videoId) });
});
