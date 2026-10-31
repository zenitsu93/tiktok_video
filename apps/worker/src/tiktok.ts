import { getAsset, getDb, getVideo, tiktokSendMoving, updateTikTokSend } from "@regie/db";
import { storage, TikTokError, tiktokAccessToken, tiktokPublishStatus, uploadToInbox } from "@regie/server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends the last export to the TikTok inbox, then follows TikTok's processing
 * until the video is waiting in the app (or for fifteen minutes at most: TikTok
 * sometimes takes more than three). Every way out writes a final state on the line,
 * and a send cancelled from the Régie stops at the next step.
 */
export async function sendToTikTok(videoId: string, sendId: string) {
  const db = getDb();
  try {
    // cancelled (or timed out) while it waited in the queue: nothing leaves
    if (!(await tiktokSendMoving(db, sendId))) return void console.log(`[tiktok] ${videoId}: envoi annulé avant le départ`);
    const row = await getVideo(db, videoId);
    const asset = row?.renderAsset ? await getAsset(db, row.renderAsset) : undefined;
    if (!asset) throw new TikTokError("Exporte d'abord le MP4.");
    const file = await storage().read(asset.storageKey);
    const t0 = Date.now();
    const publishId = await uploadToInbox(await tiktokAccessToken(db), file);
    if (!(await updateTikTokSend(db, sendId, { status: "processing", publishId }))) {
      return void console.log(`[tiktok] ${videoId}: annulé pendant l'envoi (le fichier peut quand même arriver dans la boîte TikTok)`);
    }
    console.log(`[tiktok] ${videoId}: ${(file.length / 1e6).toFixed(1)} Mo envoyés en ${Math.round((Date.now() - t0) / 1000)} s, TikTok traite`);

    // every 5 s for the first two minutes, then every 20 s
    let last = "";
    for (let waited = 0; waited < 15 * 60_000; ) {
      const step = waited < 2 * 60_000 ? 5000 : 20_000;
      await sleep(step);
      waited += step;
      if (!(await tiktokSendMoving(db, sendId))) return void console.log(`[tiktok] ${videoId}: suivi arrêté (annulé) après ${waited / 1000} s`);
      // the token is asked again each time: it may run out during the fifteen minutes
      const s = await tiktokAccessToken(db)
        .then((token) => tiktokPublishStatus(token, publishId))
        .catch((e: Error) => {
          console.warn(`[tiktok] ${videoId}: statut illisible après ${waited / 1000} s :`, e.message);
          return null;
        });
      if (!s) continue;
      if (s.status !== last) console.log(`[tiktok] ${videoId}: ${s.status} après ${waited / 1000} s`);
      last = s.status;
      if (s.status === "SEND_TO_USER_INBOX" || s.status === "PUBLISH_COMPLETE") return void (await updateTikTokSend(db, sendId, { status: "inbox" }));
      if (s.status === "FAILED") throw new TikTokError(`TikTok n'a pas pu traiter la vidéo (${s.failReason ?? "raison inconnue"}).`);
    }
    // still processing after fifteen minutes: it usually arrives anyway, the line says so (and stops « en cours »)
    console.warn(`[tiktok] ${videoId}: toujours ${last || "sans statut"} après 15 min`);
    await updateTikTokSend(db, sendId, { status: "unconfirmed" });
  } catch (e) {
    console.error(`[worker] tiktok ${videoId}:`, e);
    const message = e instanceof TikTokError ? e.message : "L'envoi à TikTok a échoué. Réessaie dans un moment.";
    await updateTikTokSend(db, sendId, { status: "error", error: message }).catch(() => undefined);
  }
}
