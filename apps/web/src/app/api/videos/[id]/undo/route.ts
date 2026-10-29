import { getDb, undo } from "@regie/db";
import { NextResponse } from "next/server";
import { HttpError, route, videoId } from "@/lib/http";
import { videoView } from "@/lib/view";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  const row = await undo(getDb(), videoId((await params).id));
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  return NextResponse.json(await videoView(row));
});
