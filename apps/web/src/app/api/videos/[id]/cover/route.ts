import { chooseCover } from "@regie/core";
import { getDb, getVideo, mutateDoc } from "@regie/db";
import { enqueue, JOBS, storage } from "@regie/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { body, HttpError, route, videoId } from "@/lib/http";
import { videoView } from "@/lib/view";

type Ctx = { params: Promise<{ id: string }> };

// under the proxy's own body limit (10 MB), like « Ma photo »
const MAX = 9_500_000;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * The video's cover (the opening « bac à disques », the record, the ending loop).
 * POST with an image as the body: « Ma pochette », parked here and cleaned by the worker, then put on.
 * POST with JSON { source: "deezer" | "pinterest" }: other sleeves to pick from.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const row = await getVideo(getDb(), id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type === "application/json") {
    const { source } = z.object({ source: z.enum(["deezer", "pinterest"]) }).strict().parse(await body(req));
    await enqueue(JOBS.cover, { videoId: id, source });
    return NextResponse.json({ queued: true }, { status: 202 });
  }
  if (!TYPES.has(type)) throw new HttpError(415, "Choisis une image (JPEG, PNG ou WebP) pour la pochette.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX) throw new HttpError(413, "Fichier trop lourd (9 Mo au plus).");
  const file = Buffer.from(await req.arrayBuffer());
  if (!file.length) throw new HttpError(400, "Image vide.");
  if (file.length > MAX) throw new HttpError(413, "Fichier trop lourd (9 Mo au plus).");
  const key = `uploads/${randomUUID()}`;
  await storage().put(key, file, type);
  await enqueue(JOBS.cover, { videoId: id, source: "upload", key });
  return NextResponse.json({ queued: true }, { status: 202 });
});

/** PATCH { cover }: one of the video's sleeves goes on the opening, the record and the ending. Free. */
export const PATCH = route(async (req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const { cover } = z.object({ cover: z.string().min(1).max(80) }).strict().parse(await body(req));
  const row = await mutateDoc(getDb(), id, "pochette choisie", (doc) => chooseCover(doc, cover));
  await enqueue(JOBS.prerender, { videoId: id });
  return NextResponse.json(await videoView(row));
});
