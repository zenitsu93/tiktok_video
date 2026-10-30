import { getDb, getVideo } from "@regie/db";
import { enqueue, JOBS, storage } from "@regie/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { beatId, HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; beatId: string }> };

// under the proxy's own body limit (10 MB); a phone photo is 2 to 5 MB
const MAX = 9_500_000;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * « Ma photo »: the file is the request body. It is only parked here; the worker decodes and
 * re-encodes it (nothing from the original file reaches the renderer), then shows it on the beat.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const p = await params;
  const id = videoId(p.id);
  const beat = beatId(p.beatId);
  const row = await getVideo(getDb(), id);
  if (!row?.doc.beats.some((b) => b.id === beat)) throw new HttpError(404, "Plan introuvable.");
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!TYPES.has(type)) throw new HttpError(415, "Choisis une image (JPEG, PNG, WebP).");
  if (Number(req.headers.get("content-length") ?? 0) > MAX) throw new HttpError(413, "Image trop lourde (9 Mo au plus).");
  const file = Buffer.from(await req.arrayBuffer());
  if (!file.length) throw new HttpError(400, "Image vide.");
  if (file.length > MAX) throw new HttpError(413, "Image trop lourde (9 Mo au plus).");
  const key = `uploads/${randomUUID()}`;
  await storage().put(key, file, type);
  await enqueue(JOBS.upload, { videoId: id, beatId: beat, key });
  return NextResponse.json({ queued: true }, { status: 202 });
});
