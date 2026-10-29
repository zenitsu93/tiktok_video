import { getDb, getVideo, mutateDoc, setStatus } from "@regie/db";
import { enqueue, JOBS } from "@regie/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { body, HttpError, route, videoId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), draft: z.string().trim().min(80).max(40_000) }).strict(),
  z.object({ action: z.literal("approve"), draft: z.string().trim().min(80).max(40_000) }).strict(),
  z.object({ action: z.literal("rewrite"), draft: z.string().trim().min(80).max(40_000), instruction: z.string().trim().min(1).max(1000) }).strict(),
]);

/**
 * The reading step: Thomas corrects the script by hand, asks Claude for a rewrite,
 * or approves it. Only approval lets the paid steps (voice, images) start.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const id = videoId((await params).id);
  const data = input.parse(await body(req));
  const db = getDb();
  const row = await getVideo(db, id);
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  if (row.status !== "review" || row.doc.beats.length) throw new HttpError(409, "Ce script n'attend pas de validation.");
  if (data.draft !== row.doc.draft || data.action === "approve") {
    await mutateDoc(db, id, data.action === "approve" ? "script validé" : "script corrigé", (d) => ({ ...d, draft: data.draft, scriptOk: data.action === "approve" || d.scriptOk }));
  }
  if (data.action === "approve") {
    await setStatus(db, id, "generating", { step: "Découpage en plans", done: 0, total: 1 });
    await enqueue(JOBS.generate, { videoId: id });
  } else if (data.action === "rewrite") {
    await setStatus(db, id, "generating", { step: "Réécriture du script", done: 0, total: 1 });
    await enqueue(JOBS.script, { videoId: id, instruction: data.instruction });
  }
  return NextResponse.json({ ok: true, action: data.action }, { status: data.action === "save" ? 200 : 202 });
});
