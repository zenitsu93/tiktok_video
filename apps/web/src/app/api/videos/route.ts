import { newVideoSchema } from "@regie/core";
import { createVideo, getDb, listVideos, setStatus } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { body, route } from "@/lib/http";

export const GET = route(async () => NextResponse.json({ videos: await listVideos(getDb()) }));

/** "Quelle chanson ?": creates the video and queues the whole pipeline. */
export const POST = route(async (req) => {
  const input = newVideoSchema.parse(await body(req));
  const db = getDb();
  const row = await createVideo(db, { ...input, cover: null, voiceTrack: null, beats: [], assets: {}, sources: [] });
  await setStatus(db, row.id, "generating", { step: "En file", done: 0, total: 1 });
  await enqueue(JOBS.generate, { videoId: row.id });
  return NextResponse.json({ id: row.id }, { status: 201 });
});
