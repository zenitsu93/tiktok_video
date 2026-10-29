import { getAsset, getDb } from "@regie/db";
import { storage, verifyMedia } from "@regie/server";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

const deny = () => new Response("Lien expiré ou invalide.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * Images, voice and exports. Access is by signed link only (see signMedia), so it
 * works from the sandboxed preview, and a leaked link dies within hours.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  if (!verifyMedia(id, q.get("e"), q.get("s"))) return deny();
  const row = await getAsset(getDb(), id);
  if (!row) return new Response("Introuvable.", { status: 404 });

  const dl = q.get("dl");
  const name = dl ? `${dl.replace(/[^a-z0-9-]/g, "").slice(0, 60) || "video"}.${row.mime === "video/mp4" ? "mp4" : "bin"}` : null;
  const direct = await storage().directUrl(row.storageKey, 900, name ?? undefined);
  if (direct) return Response.redirect(direct, 302);

  const size = row.size;
  const headers = new Headers({
    "Content-Type": row.mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600, immutable",
    "Accept-Ranges": "bytes",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  if (name) headers.set("Content-Disposition", `attachment; filename="${name}"`);

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const s = await storage().stream(row.storageKey, { start, end });
    return new Response(Readable.toWeb(s) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(await storage().stream(row.storageKey)) as ReadableStream, { headers });
}
