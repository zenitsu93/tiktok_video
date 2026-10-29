import { getDb, getVideo, setBusy } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** « Écrire la légende » / « Réécrire » : Claude writes the TikTok caption from the script as it reads now. */
export const POST = route(async (_req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const db = getDb();
  const row = await getVideo(db, id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  if (!row.doc.beats.length) throw new HttpError(409, "Il n'y a encore aucun plan.");
  // shown at once, cleared by the worker when the caption is written
  await setBusy(db, id, "caption", true);
  await enqueue(JOBS.caption, { videoId: id });
  return NextResponse.json({ queued: true }, { status: 202 });
});
