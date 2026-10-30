import { getDb, getVideo, mutateDoc, setStatus } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * « Valider la voix » : Thomas has heard it; the images are searched now (they are paid for),
 * or, with `{ manual: true }`, he brings them himself on La Planche (only the free album cover is fetched).
 */
export const POST = route(async (req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const db = getDb();
  const row = await getVideo(db, id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  if (row.status !== "listen") throw new HttpError(409, "Cette voix n'attend pas de validation.");
  if (row.busyBeats.length) throw new HttpError(409, "Une ligne est encore en cours : attends qu'elle finisse.");
  const body = (await req.json().catch(() => ({}))) as { manual?: unknown };
  const manual = body?.manual === true;
  await mutateDoc(db, id, manual ? "voix validée, images à la main" : "voix validée", (d) => ({ ...d, voiceOk: true, manualImages: manual }));
  await setStatus(db, id, "generating", { step: "Images", done: 0, total: 1 });
  await enqueue(JOBS.generate, { videoId: id });
  return NextResponse.json({ ok: true }, { status: 202 });
});
