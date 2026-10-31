import { cancelTikTokSend, createTikTokSend, expireTikTokSends, getDb, getVideo, tiktokSendInFlight } from "@regie/db";
import { enqueue, JOBS, tiktokConfigured, tiktokConnected } from "@regie/server";
import { NextResponse } from "next/server";
import { HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Queues the last export for the owner's TikTok inbox. The worker does the upload. */
export const POST = route(async (_req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const db = getDb();
  const row = await getVideo(db, id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  if (!row.renderAsset) throw new HttpError(409, "Exporte d'abord le MP4.");
  if (!tiktokConfigured()) throw new HttpError(409, "Ajoute TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET sur le serveur.");
  if (!(await tiktokConnected(db))) throw new HttpError(409, "Connecte d'abord ton compte TikTok.");
  await expireTikTokSends(db);
  if (await tiktokSendInFlight(db, id)) throw new HttpError(409, "Un envoi est déjà en cours.");
  const sendId = await createTikTokSend(db, id, row.renderAsset);
  await enqueue(JOBS.tiktok, { videoId: id, sendId });
  return NextResponse.json({ queued: true }, { status: 202 });
});

/**
 * « Annuler l'envoi »: the send stops showing « en cours » and the MP4 can leave again.
 * The worker stops at its next step; a file already handed to TikTok may still reach the inbox.
 */
export const DELETE = route(async (_req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const db = getDb();
  if (!(await getVideo(db, id))) throw new HttpError(404, "Vidéo introuvable.");
  const cancelled = await cancelTikTokSend(db, id);
  return NextResponse.json({ cancelled });
});
