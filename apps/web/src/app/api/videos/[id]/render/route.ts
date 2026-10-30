import { getDb, getVideo, setStatus } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Exports the MP4. Only the scenes that changed since the last export go through the renderer. */
export const POST = route(async (_req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const db = getDb();
  const row = await getVideo(db, id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  if (row.status === "generating") throw new HttpError(409, "La vidéo est encore en préparation.");
  if (row.status === "listen") throw new HttpError(409, "Valide d'abord la voix : les images ne sont pas encore cherchées.");
  if (!row.doc.beats.length) throw new HttpError(409, "Il n'y a encore aucun plan.");
  await setStatus(db, id, "rendering", { step: "En file", done: 0, total: 1 });
  await enqueue(JOBS.render, { videoId: id });
  return NextResponse.json({ queued: true }, { status: 202 });
});
