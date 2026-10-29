import { deleteVideo, getDb, getVideo } from "@regie/db";
import { storage } from "@regie/server";
import { NextResponse } from "next/server";
import { HttpError, route, videoId } from "@/lib/http";
import { videoView } from "@/lib/view";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const row = await getVideo(getDb(), videoId((await params).id));
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  return NextResponse.json(await videoView(row), { headers: { "Cache-Control": "no-store" } });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const files = await deleteVideo(getDb(), videoId((await params).id));
  // the rows are already gone: a file that fails to go is only wasted space
  await Promise.all(files.map((key) => storage().remove(key).catch(() => undefined)));
  return new NextResponse(null, { status: 204 });
});
