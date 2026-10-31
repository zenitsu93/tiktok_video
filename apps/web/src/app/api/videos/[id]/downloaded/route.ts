import { getDb, markDownloaded } from "@regie/db";
import { NextResponse } from "next/server";
import { route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** The MP4 left by « Télécharger »: the home screen asks later whether it was published. */
export const POST = route(async (_req, { params }: Ctx) => {
  await markDownloaded(getDb(), videoId((await params).id));
  return new NextResponse(null, { status: 204 });
});
