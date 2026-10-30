import { putFromLibrary } from "@regie/core";
import { getDb, getLibraryItem, mutateDoc } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { beatId, body, HttpError, route, videoId } from "@/lib/http";
import { videoView } from "@/lib/view";

type Ctx = { params: Promise<{ id: string; beatId: string }> };

const input = z.object({ asset: z.string().min(1).max(80), also: z.array(z.string()).max(40).optional() }).strict();

/** A picture from the library on this shot (and the other lines of its idea, `also`). Free: nothing is searched. */
export const POST = route(async (req, { params }: Ctx) => {
  const p = await params;
  const id = videoId(p.id);
  const beat = beatId(p.beatId);
  const { asset, also = [] } = input.parse(await body(req));
  const item = await getLibraryItem(getDb(), asset);
  if (!item) throw new HttpError(404, "Cette image n'est plus dans ta bibliothèque.");
  const ids = [beat, ...also.map(beatId)];
  const row = await mutateDoc(getDb(), id, `${ids.join(",")} : image de la bibliothèque`, (doc) => {
    if (!doc.beats.some((b) => b.id === beat)) throw new HttpError(404, "Plan introuvable.");
    return putFromLibrary(doc, item, ids);
  });
  await enqueue(JOBS.prerender, { videoId: id });
  return NextResponse.json(await videoView(row));
});
