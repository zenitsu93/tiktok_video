import { getDb, setPublished } from "@regie/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { body, HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** « Je l'ai publiée »: Thomas ticks it himself, TikTok never tells the Régie. */
export const POST = route(async (req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const { published } = z.object({ published: z.boolean() }).strict().parse(await body(req));
  const row = await setPublished(getDb(), id, published);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  return NextResponse.json({ publishedAt: row.publishedAt?.toISOString() ?? null });
});
