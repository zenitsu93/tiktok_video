import { applyStyle } from "@regie/core";
import { getDb, getVideo, mutateDoc, setBusy } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route, videoId } from "@/lib/http";
import { videoView } from "@/lib/view";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ style: z.number().int().min(0) }).partial();

/**
 * « ↻ Remonter autrement » (no body): the worker montages the same video again with a new style.
 * `{ style: n }`: back to a style already tried, at once and for free.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const db = getDb();
  const row = await getVideo(db, id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  if (!row.doc.beats.length) throw new HttpError(409, "Il n'y a encore aucun plan.");
  const { style } = body.parse(await req.json().catch(() => ({})));
  if (style === undefined) {
    if (row.busyBeats.includes("restyle")) throw new HttpError(409, "Un nouveau montage est déjà en cours.");
    await setBusy(db, id, "restyle", true);
    await enqueue(JOBS.restyle, { videoId: id });
    return NextResponse.json({ queued: true }, { status: 202 });
  }
  // a version like any other edit, so « Annuler » undoes it too
  const next = await mutateDoc(db, id, `style ${style + 1}`, (d) => applyStyle(d, style));
  await enqueue(JOBS.prerender, { videoId: id });
  return NextResponse.json(await videoView(next));
});
