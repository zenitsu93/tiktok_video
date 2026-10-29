import { closeDb, getDb, setError, setStatus } from "@regie/db";
import { BudgetError, env, jobData, JOBS, providers, queue, type JobName } from "@regie/server";
import { generate, moreImages, render, revoice, rewrite } from "./pipeline";

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
      await fail(data.videoId, e, fatal);
      // budget and configuration errors will not fix themselves: do not retry
      if (!(e instanceof BudgetError)) throw e;
    }
  });
}

await handle(JOBS.generate, 1, (d: { videoId: string }) => generate(d.videoId), true);
await handle(JOBS.voice, 3, (d: { videoId: string; beatId: string }) => revoice(d.videoId, d.beatId));
await handle(JOBS.images, 2, (d: { videoId: string; beatId: string; instruction?: string }) => moreImages(d.videoId, d.beatId, d.instruction));
await handle(JOBS.rewrite, 2, (d: { videoId: string; beatId: string; instruction: string }) => rewrite(d.videoId, d.beatId, d.instruction));
await handle(JOBS.render, 1, (d: { videoId: string }) => render(d.videoId), true);

console.log("[worker] prêt");

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    await closeDb();
    process.exit(0);
  });
}
