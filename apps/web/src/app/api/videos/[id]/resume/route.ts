import { getDb, getVideo, setStatus } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Picks a failed video up where it stopped. The worker skips what is already saved
 * (script, voices, images, cover), so only the missing steps are paid for again.
 */
export const POST = route(async (_req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const db = getDb();
  const row = await getVideo(db, id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  if (row.status !== "error") throw new HttpError(409, "Cette vidéo n'est pas en erreur.");
  const { beats } = row.doc;
  const unfinished = !beats.length || beats.some((b) => !b.voice || b.voiceText !== b.text || !b.candidates.length);
  if (unfinished) {
    await setStatus(db, id, "generating", { step: "Reprise", done: 0, total: 1 });
    await enqueue(JOBS.generate, { videoId: id });
  } else {
    await setStatus(db, id, "rendering", { step: "En file", done: 0, total: 1 });
    await enqueue(JOBS.render, { videoId: id });
  }
  return NextResponse.json({ queued: true, step: unfinished ? "generate" : "render" }, { status: 202 });
});
