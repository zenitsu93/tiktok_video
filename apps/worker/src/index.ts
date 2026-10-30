import { closeDb, getDb, setError, setProgress, setStatus } from "@regie/db";
import { BudgetError, env, jobData, JOBS, providers, queue, retryLimit, type JobName } from "@regie/server";
import { cleanup } from "./cleanup";
import { fillLibrary } from "./library";
import { caption, cleanImage, generate, ownImage, moreImages, prerender, render, reviseScript, revoice, rewrite } from "./pipeline";
import { sendToTikTok } from "./tiktok";

/**
 * The worker runs every slow or paid step outside the web app: model calls,
 * downloads, voice synthesis and rendering. It holds the API keys; the web app
 * only queues jobs.
 */
env();
const p = providers();
console.log(`[worker] Claude ${p.claude ? "actif" : "démo"} · voix ${p.voice ? "ElevenLabs" : "démo"} · images ${p.images ? "Apify" : "démo"}`);

async function fail(videoId: string, e: unknown, fatal: boolean) {
  const message = e instanceof BudgetError || e instanceof Error ? e.message : String(e);
  console.error(`[worker] ${videoId}:`, e);
  if (fatal) await setStatus(getDb(), videoId, "error", null, message);
  else await setError(getDb(), videoId, message);
}

const boss = await queue();

function handle<N extends JobName>(name: N, concurrency: number, fn: (data: never) => Promise<void>, fatal = false) {
  return boss.work(name, { localConcurrency: concurrency }, async ([job]) => {
    const data = jobData[name].parse(job!.data) as { videoId: string };
    await setError(getDb(), data.videoId, null);
    try {
      await fn(data as never);
    } catch (e) {
      // budget and configuration errors will not fix themselves: do not retry
      if (e instanceof BudgetError) return void (await fail(data.videoId, e, fatal));
      // another attempt is coming: keep the video in progress rather than showing an error
      if (fatal && job!.retryCount < retryLimit(name)) {
        console.error(`[worker] ${data.videoId}: essai ${job!.retryCount + 1} raté, nouvel essai`, e);
        const wait = 10 * 2 ** job!.retryCount;
        await setProgress(getDb(), data.videoId, { step: `Connexion perdue · nouvel essai dans ~${wait} s`, done: 0, total: 1 });
      } else await fail(data.videoId, e, fatal);
      throw e;
    }
  });
}

await handle(JOBS.generate, 1, (d: { videoId: string }) => generate(d.videoId), true);
await handle(JOBS.script, 1, (d: { videoId: string; instruction: string }) => reviseScript(d.videoId, d.instruction));
await handle(JOBS.voice, 3, (d: { videoId: string; beatId: string }) => revoice(d.videoId, d.beatId));
await handle(JOBS.images, 2, (d: { videoId: string; beatId: string; instruction?: string }) => moreImages(d.videoId, d.beatId, d.instruction));
await handle(JOBS.upload, 2, (d: { videoId: string; beatId: string; key: string; also?: string[]; mime?: string }) => ownImage(d.videoId, d.beatId, d.key, d.also, d.mime));
await handle(JOBS.clean, 1, (d: { videoId: string; beatId: string }) => cleanImage(d.videoId, d.beatId));
await handle(JOBS.rewrite, 2, (d: { videoId: string; beatId: string; instruction: string }) => rewrite(d.videoId, d.beatId, d.instruction));
await handle(JOBS.render, 1, (d: { videoId: string }) => render(d.videoId), true);
await handle(JOBS.caption, 1, (d: { videoId: string }) => caption(d.videoId));

// the send records its own outcome on its line; it never marks the video as failed
await boss.work(JOBS.tiktok, { localConcurrency: 1 }, async ([job]) => {
  const d = jobData[JOBS.tiktok].parse(job!.data);
  await sendToTikTok(d.videoId, d.sendId);
});

// the head start never touches the video's status or error: it only saves time on the next export
await boss.work(JOBS.prerender, { localConcurrency: 1 }, async ([job]) => {
  const d = jobData[JOBS.prerender].parse(job!.data);
  await prerender(d.videoId).catch((e) => console.warn(`[prerender] ${d.videoId}:`, (e as Error).message));
});

// every night at 4:00 (UTC); a missed night is caught up by the next one
await boss.schedule(JOBS.cleanup, "0 4 * * *");
await boss.work(JOBS.cleanup, () => cleanup());

// the videos exported before the library existed give it their pictures, once
await fillLibrary().catch((e) => console.warn("[bibliothèque]", (e as Error).message));

console.log("[worker] prêt");

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    await closeDb();
    process.exit(0);
  });
}
