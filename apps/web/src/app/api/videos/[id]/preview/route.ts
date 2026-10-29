import { previewDocument } from "@regie/core";
import { getDb, getVideo } from "@regie/db";
import { brandFonts, env, signMedia } from "@regie/server";
import { HttpError, route, videoId } from "@/lib/http";
import { PREVIEW_SHIM } from "@/lib/preview-shim";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The whole video as one live HTML page, the same markup the renderer gets.
 * It runs in a sandboxed frame with no origin, so it can not reach the app's
 * cookies or API; images and voice come through short-lived signed links.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const row = await getVideo(getDb(), videoId((await params).id));
  if (!row) throw new HttpError(404, "Vidéo introuvable.");
  const doc = row.doc;
  const html = previewDocument(
    doc,
    { assets: doc.assets, src: (id) => (doc.assets[id] ? signMedia(id, 6 * 3600) : "") },
    {
      vendorBase: "/vendor",
      font: brandFonts().name,
      audio: doc.voiceTrack ? signMedia(doc.voiceTrack, 6 * 3600) : undefined,
      extraHead: `<style>.clip{visibility:hidden}</style>`,
      extraBody: `<script>${PREVIEW_SHIM}</script>`,
    },
  );
  const origins = [...new Set([new URL(env().APP_URL).origin, req.nextUrl.origin])].join(" ");
  const csp = [
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src 'unsafe-inline' ${origins}`,
    "style-src 'unsafe-inline'",
    `img-src ${origins} data:`,
    `font-src ${origins}`,
    `media-src ${origins}`,
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "private, no-store",
    },
  });
});
