import { deleteOrphanScenes, deleteVideo, getDb, staleVideos } from "@regie/db";
import { env, storage } from "@regie/server";

/**
 * The VPS disk is small: a video untouched for RETENTION_DAYS days goes, as with the
 * « Supprimer » button (versions and the files nothing else uses). The spend history stays.
 */
export async function cleanup() {
  const db = getDb();
  // scene clips left by deleted videos, whatever the retention
  const scenes = await deleteOrphanScenes(db);
  await Promise.all(scenes.map((key) => storage().remove(key).catch(() => undefined)));
  if (scenes.length) console.log(`[cleanup] ${scenes.length} plans en cache sans vidéo supprimés`);
  const days = env().RETENTION_DAYS;
  if (!days) return;
  for (const id of await staleVideos(db, days)) {
    const files = await deleteVideo(db, id);
    // the rows are already gone: a file that fails to go is only wasted space
    await Promise.all(files.map((key) => storage().remove(key).catch(() => undefined)));
    console.log(`[cleanup] ${id} supprimée après ${days} jours sans modification (${files.length} fichiers)`);
  }
}
