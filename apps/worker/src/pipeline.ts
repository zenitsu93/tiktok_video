import { applyBeatPatch, beatContext, ENTRANCES, timeBeats, type Asset, type Beat, type VideoDoc } from "@regie/core";
import { getAsset, getDb, getVideo, mutateDoc, setBusy, setProgress, setRendered, setStatus } from "@regie/db";
import { enqueue, JOBS, providers, storage } from "@regie/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { ff, ingestImage, ingestVoice, storeFile, withTemp } from "./media";
import { editBeat, splitScript, writeScript } from "./providers/claude";
import { demoImages, demoScript, demoVoice } from "./providers/demo";
import { speak } from "./providers/elevenlabs";
import { deezerCover, fetchImage, searchPinterest } from "./providers/images";
import { exportVideo } from "./render";

const db = () => getDb();

async function load(videoId: string) {
  const row = await getVideo(db(), videoId);
  if (!row) throw new Error(`vidéo ${videoId} introuvable`);
  return row;
}

/** Wraps a one-beat job so the line shows a spinner while it runs. */
async function onBeat<T>(videoId: string, beatId: string, fn: () => Promise<T>): Promise<T> {
  await setBusy(db(), videoId, beatId, true);
  try {
    return await fn();
  } finally {
    await setBusy(db(), videoId, beatId, false);
  }
}

// ---------------------------------------------------------------- voice

export async function voiceBeat(videoId: string, beatId: string, remix = true) {
  const { doc } = await load(videoId);
  const i = doc.beats.findIndex((b) => b.id === beatId);
  const beat = doc.beats[i];
  if (!beat) return;
  const text = beat.text;
  const audio = providers().voice
    ? await speak(videoId, text, { previous: doc.beats[i - 1]?.text, next: doc.beats[i + 1]?.text })
    : await demoVoice(text);
  const asset = await ingestVoice(audio, providers().voice ? "elevenlabs" : "démo", providers().voice);
  await mutateDoc(db(), videoId, `voix ${beatId}`, (d) => ({
    ...d,
    assets: { ...d.assets, [asset.id]: asset },
    // if the sentence changed again meanwhile, its own job will voice it
    beats: d.beats.map((b) => (b.id === beatId && b.text === text ? { ...b, voice: asset.id, voiceText: text } : b)),
  }));
  if (remix) await remixVoice(videoId);
}

/** Mixes every clip at its beat's frame, for the preview and the export. Takes a second or two. */
export async function remixVoice(videoId: string) {
  const { doc } = await load(videoId);
  if (doc.beats.some((b) => !b.voice)) return;
  const { beats, total } = timeBeats(doc);
  const track = await withTemp(async (dir) => {
    const inputs: string[] = [];
    const filters: string[] = [];
    for (const [k, b] of beats.entries()) {
      const row = await getAsset(db(), b.voice!);
      if (!row) throw new Error(`clip ${b.voice} introuvable`);
      const file = join(dir, `${k}.m4a`);
      await storage().download(row.storageKey, file);
      inputs.push("-i", file);
      const ms = Math.round((b.startFrame / 30) * 1000);
      filters.push(`[${k}:a]adelay=${ms}|${ms}[d${k}]`);
    }
    const mix = `${filters.join(";")};${beats.map((_, k) => `[d${k}]`).join("")}amix=inputs=${beats.length}:normalize=0,apad[out]`;
    const out = join(dir, "voice.m4a");
    await ff("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", mix, "-map", "[out]", "-t", total.toFixed(3), "-ac", "1", "-c:a", "aac", "-b:a", "160k", out]);
    return storeFile("m", await readFile(out), "audio/mp4", "m4a", "audio", "mix");
  });
  const withDuration: Asset = { ...track, duration: total };
  await mutateDoc(db(), videoId, "piste voix", (d) => ({ ...d, voiceTrack: track.id, assets: { ...d.assets, [track.id]: withDuration } }));
}

// ---------------------------------------------------------------- images

/**
 * Downloads up to `want` new candidates for a set of beats that share one idea.
 * `select` makes the first new image the shown one (used when Thomas asked for another image).
 */
export async function imagesFor(videoId: string, beatIds: string[], opts: { queries?: string[]; select?: boolean; want?: number } = {}) {
  const { doc } = await load(videoId);
  const beats = doc.beats.filter((b) => beatIds.includes(b.id));
  const first = beats[0];
  if (!first) return;
  const query = opts.queries?.length ? { kind: "pinterest" as const, queries: opts.queries } : first.imageQuery;
  const known = new Set(Object.values(doc.assets).map((a) => a.source));
  const want = opts.want ?? 6;
  const added: Asset[] = [];

  if (query.kind === "cover") {
    const url = await deezerCover(doc.title, doc.artist);
    if (url && !known.has(url)) added.push(await ingestImage(await fetchImage(url), url));
  } else if (query.kind === "pinterest") {
    if (providers().images) {
      const urls: string[] = [];
      for (const q of query.queries) urls.push(...(await searchPinterest(videoId, q, want)));
      for (const url of [...new Set(urls)].filter((u) => !known.has(u))) {
        if (added.length >= want) break;
        try {
          added.push(await ingestImage(await fetchImage(url), url));
        } catch (e) {
          console.warn("[images] skipped", url, (e as Error).message);
        }
      }
    } else {
      const seed = Number.parseInt(first.id.slice(1), 10) + Object.keys(doc.assets).length;
      for (const [k, buf] of (await demoImages(query.queries[0] ?? doc.title, Math.min(want, 4), seed)).entries()) {
        added.push(await ingestImage(buf, `démo:${first.id}:${seed}:${k}`));
      }
    }
  }
  if (!added.length) return;
  await mutateDoc(db(), videoId, `images ${beatIds.join(",")}`, (d) => ({
    ...d,
    assets: { ...d.assets, ...Object.fromEntries(added.map((a) => [a.id, a])) },
    beats: d.beats.map((b) => {
      if (!beatIds.includes(b.id)) return b;
      const candidates = [...added.map((a) => a.id), ...b.candidates.filter((c) => !added.some((a) => a.id === c))].slice(0, 24);
      return {
        ...b,
        imageQuery: query,
        candidates,
        image: opts.select || !b.image ? added[0]!.id : b.image,
      };
    }),
  }));
}

async function coverFor(videoId: string) {
  const { doc } = await load(videoId);
  try {
    const url = await deezerCover(doc.title, doc.artist);
    if (!url) return;
    const asset = await ingestImage(await fetchImage(url), url);
    await mutateDoc(db(), videoId, "pochette", (d) => ({ ...d, cover: asset.id, assets: { ...d.assets, [asset.id]: asset } }));
  } catch (e) {
    console.warn("[cover]", (e as Error).message);
  }
}

// ---------------------------------------------------------------- full pipeline

function toBeats(rows: { text: string; hero: string; layout: Beat["layout"]; imageQuery: Beat["imageQuery"] }[]): Beat[] {
  let r = 0;
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    const sameIdea = prev && prev.imageQuery.queries.join() === row.imageQuery.queries.join() && row.imageQuery.kind !== "none";
    const visual = row.layout === "card" || row.layout === "cutout";
    if (visual && !sameIdea) r = (r + 1) % ENTRANCES.length;
    return {
      id: `b${String(i + 1).padStart(2, "0")}`,
      text: row.text.trim(),
      hero: row.hero && row.text.toLowerCase().includes(row.hero.toLowerCase()) ? row.hero : "",
      layout: row.layout,
      entrance: visual ? ENTRANCES[r]! : "pop",
      image: null,
      candidates: [],
      imageQuery: row.imageQuery,
      accent: i % 4 === 2,
      reveal: row.layout === "text" && i % 3 === 0 ? "fade" : "type",
      voice: null,
      voiceText: null,
      gap: /[.?!…]$/.test(row.text.trim()) ? 0.35 : 0.08,
    };
  });
}

export async function generate(videoId: string) {
  const row = await load(videoId);
  await setStatus(db(), videoId, "generating", { step: "Écriture du script", done: 0, total: 1 });

  const { beats: rows, sources } = providers().claude
    ? await (async () => {
        const { script, sources } = await writeScript(videoId, { title: row.doc.title, artist: row.doc.artist, angle: row.doc.angle });
        await setProgress(db(), videoId, { step: "Découpage en plans", done: 0, total: 1 });
        return { beats: await splitScript(videoId, script), sources };
      })()
    : demoScript(row.doc.title, row.doc.artist);
  const beats = toBeats(rows);
  await mutateDoc(db(), videoId, "script", (d) => ({ ...d, beats, sources }));

  // voice, three sentences at a time
  const voiceLimit = pLimit(3);
  let voiced = 0;
  await Promise.all(
    beats.map((b) =>
      voiceLimit(async () => {
        await voiceBeat(videoId, b.id, false);
        await setProgress(db(), videoId, { step: "Voix off", done: ++voiced, total: beats.length });
      }),
    ),
  );
  await remixVoice(videoId);

  // images: one search per idea, shared by the beats that say it
  const groups: string[][] = [];
  beats.forEach((b, i) => {
    if (b.imageQuery.kind === "none") return;
    const prev = beats[i - 1];
    if (prev && groups.length && prev.imageQuery.kind === b.imageQuery.kind && prev.imageQuery.queries.join() === b.imageQuery.queries.join()) {
      groups.at(-1)!.push(b.id);
    } else groups.push([b.id]);
  });
  const imageLimit = pLimit(2);
  let found = 0;
  await Promise.all(
    groups.map((g) =>
      imageLimit(async () => {
        try {
          await imagesFor(videoId, g);
        } catch (e) {
          console.warn("[images]", g.join(","), (e as Error).message);
        }
        await setProgress(db(), videoId, { step: "Images", done: ++found, total: groups.length });
      }),
    ),
  );
  await coverFor(videoId);
  await setStatus(db(), videoId, "ready");
  await enqueue(JOBS.render, { videoId });
}

// ---------------------------------------------------------------- one-beat edits

export async function rewrite(videoId: string, beatId: string, instruction: string) {
  if (!providers().claude) throw new Error("Ajoute ta clé Claude (ANTHROPIC_API_KEY) pour corriger un plan avec une consigne.");
  await onBeat(videoId, beatId, async () => {
    const { doc } = await load(videoId);
    const edit = await editBeat(videoId, beatContext(doc, beatId), instruction);
    let voiceChanged = false;
    await mutateDoc(db(), videoId, `retouche ${beatId} : ${edit.note}`, (d) => {
      const patch: Parameters<typeof applyBeatPatch>[2] = {};
      if (edit.text) patch.text = edit.text;
      if (edit.hero !== null) patch.hero = edit.hero;
      if (edit.layout) patch.layout = edit.layout;
      if (edit.entrance) patch.entrance = edit.entrance;
      const r = applyBeatPatch(d, beatId, patch);
      voiceChanged = r.voiceChanged;
      return r.doc;
    });
    if (edit.imageQueries?.length) await imagesFor(videoId, [beatId], { queries: edit.imageQueries, select: true, want: 4 });
    if (voiceChanged) await voiceBeat(videoId, beatId);
  });
}

export async function moreImages(videoId: string, beatId: string, instruction?: string) {
  await onBeat(videoId, beatId, async () => {
    if (instruction && providers().claude) {
      const { doc } = await load(videoId);
      const edit = await editBeat(videoId, beatContext(doc, beatId), `Trouve d'autres images : ${instruction}`);
      await imagesFor(videoId, [beatId], { queries: edit.imageQueries ?? undefined, select: true, want: 4 });
    } else {
      // no model call: same searches, next results
      await imagesFor(videoId, [beatId], { want: 4 });
    }
  });
}

export async function revoice(videoId: string, beatId: string) {
  await onBeat(videoId, beatId, () => voiceBeat(videoId, beatId));
}

export async function render(videoId: string) {
  const row = await load(videoId);
  if (row.doc.beats.some((b) => !b.voice)) throw new Error("Toutes les phrases n'ont pas encore de voix.");
  await setStatus(db(), videoId, "rendering", { step: "Montage", done: 0, total: 1 });
  const res = await exportVideo(videoId, row.doc, (done, total) => setProgress(db(), videoId, { step: "Montage des plans", done, total }));
  await setRendered(db(), videoId, res.asset.id, res.hashes);
  await setStatus(db(), videoId, "ready");
  console.log(`[render] ${videoId}: ${res.rendered}/${res.total} scènes rendues, le reste venait du cache`);
}

