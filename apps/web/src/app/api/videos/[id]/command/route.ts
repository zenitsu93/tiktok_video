import { parseCommand } from "@regie/core";
import { getDb, getVideo } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { body, HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const IMAGE_ONLY = /^(?:(?:une?|des|d'autres?|autres?)\s+)?(?:image|images|photo|photos|illustration|visuel)s?\b/i;

/** The command bar: "@b08 une photo plus vieille". Image-only asks skip the rewrite and only search. */
export const POST = route(async (req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const data = z
    .object({ input: z.string().trim().min(1).max(500), selected: z.string().regex(/^b\d{2,3}$/).nullable() })
    .strict()
    .parse(await body(req));
  const { beatId, instruction } = parseCommand(data.input, data.selected);
  if (!beatId) throw new HttpError(400, "Choisis une phrase ou commence par @b08.");
  if (!instruction) throw new HttpError(400, "Dis ce qu'il faut changer.");
  const row = await getVideo(getDb(), id);
  if (!row?.doc.beats.some((b) => b.id === beatId)) throw new HttpError(404, `Le plan ${beatId} n'existe pas.`);
  if (IMAGE_ONLY.test(instruction)) await enqueue(JOBS.images, { videoId: id, beatId, instruction });
  else await enqueue(JOBS.rewrite, { videoId: id, beatId, instruction });
  return NextResponse.json({ queued: true, beatId }, { status: 202 });
});
