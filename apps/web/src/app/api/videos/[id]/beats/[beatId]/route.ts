import { applyBeatPatch, beatPatchSchema } from "@regie/core";
import { getDb, mutateDoc } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { beatId, body, route, videoId } from "@/lib/http";
import { videoView } from "@/lib/view";

type Ctx = { params: Promise<{ id: string; beatId: string }> };

/** Hand edits: text, hero word, effect, image choice. Free, no model call; a new text queues only that line's voice. */
export const PATCH = route(async (req, { params }: Ctx) => {
  const p = await params;
  const id = videoId(p.id);
  const beat = beatId(p.beatId);
  const patch = beatPatchSchema.parse(await body(req));
  let voiceChanged = false;
  const fields = Object.keys(patch).join(", ");
  const row = await mutateDoc(getDb(), id, `${beat} : ${fields}`, (doc) => {
    const r = applyBeatPatch(doc, beat, patch);
    voiceChanged = r.voiceChanged;
    return r.doc;
  });
  if (voiceChanged) await enqueue(JOBS.voice, { videoId: id, beatId: beat });
  return NextResponse.json(await videoView(row));
});
