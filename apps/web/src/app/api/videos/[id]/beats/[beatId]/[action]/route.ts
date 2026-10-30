import { getDb, getVideo } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { beatId, body, HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; beatId: string; action: string }> };

const instruction = z.string().trim().max(500);

/**
 * One-line actions that go through the worker:
 * images (next results, or a new search when there is an instruction), clean (cut the background
 * out of the shown image), voice, rewrite (Claude).
 */
export const POST = route(async (req, { params }: Ctx) => {
  const p = await params;
  const id = videoId(p.id);
  const beat = beatId(p.beatId);
  const row = await getVideo(getDb(), id);
  if (!row?.doc.beats.some((b) => b.id === beat)) throw new HttpError(404, "Plan introuvable.");
  const data = z.object({ instruction: instruction.optional() }).strict().parse(await body(req));
  switch (p.action) {
    case "images":
      await enqueue(JOBS.images, { videoId: id, beatId: beat, instruction: data.instruction || undefined });
      break;
    case "clean":
      await enqueue(JOBS.clean, { videoId: id, beatId: beat });
      break;
    case "voice":
      await enqueue(JOBS.voice, { videoId: id, beatId: beat });
      break;
    case "rewrite":
      if (!data.instruction) throw new HttpError(400, "Dis ce qu'il faut changer.");
      await enqueue(JOBS.rewrite, { videoId: id, beatId: beat, instruction: data.instruction });
      break;
    default:
      throw new HttpError(404, "Action inconnue.");
  }
  return NextResponse.json({ queued: true }, { status: 202 });
});
