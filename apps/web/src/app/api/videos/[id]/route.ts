import { deleteVideo, getDb, getVideo } from "@regie/db";
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
  await deleteVideo(getDb(), videoId((await params).id));
  return new NextResponse(null, { status: 204 });
});
