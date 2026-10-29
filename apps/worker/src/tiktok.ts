import { getAsset, getDb, getVideo, updateTikTokSend } from "@regie/db";
import { storage, TikTokError, tiktokAccessToken, tiktokPublishStatus, uploadToInbox } from "@regie/server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends the last export to the TikTok inbox, then follows TikTok's processing
 * until the draft is waiting in the app (or for three minutes at most).
 */
export async function sendToTikTok(videoId: string, sendId: string) {
  const db = getDb();
  try {
    const row = await getVideo(db, videoId);
    const asset = row?.renderAsset ? await getAsset(db, row.renderAsset) : undefined;
    if (!asset) throw new TikTokError("Exporte d'abord le MP4.");
    const token = await tiktokAccessToken(db);
    const publishId = await uploadToInbox(token, await storage().read(asset.storageKey));
    await updateTikTokSend(db, sendId, { status: "processing", publishId });

    for (let i = 0; i < 36; i++) {
      await sleep(5000);
      const s = await tiktokPublishStatus(token, publishId).catch(() => null);
      if (!s) continue;
      if (s.status === "SEND_TO_USER_INBOX" || s.status === "PUBLISH_COMPLETE") return void (await updateTikTokSend(db, sendId, { status: "inbox" }));
      if (s.status === "FAILED") throw new TikTokError(`TikTok n'a pas pu traiter la vidéo (${s.failReason ?? "raison inconnue"}).`);
    }
    // still processing after three minutes: it usually arrives anyway, the line says so
  } catch (e) {
    console.error(`[worker] tiktok ${videoId}:`, e);
    const message = e instanceof TikTokError ? e.message : "L'envoi à TikTok a échoué. Réessaie dans un moment.";
    await updateTikTokSend(db, sendId, { status: "error", error: message });
  }
}
