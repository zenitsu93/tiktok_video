import { applyBeatPatch, beatContext, FPS, spokenText, timeBeats, voiceStale, type Asset, type Beat, type VideoDoc } from "@regie/core";
import { createTikTokSend, getAsset, getDb, getVideo, lastTikTokSend, mutateDoc, pronunciationLexicon, setBusy, setError, setProgress, setRendered, setStatus, tiktokSendInFlight } from "@regie/db";
import { BudgetError, enqueue, env, JOBS, providers, storage, tiktokConfigured, tiktokConnected } from "@regie/server";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import pLimit from "p-limit";
import { takeCuts, toBeats } from "./beats";
import { ff, ingestImage, ingestVoice, sliceTake, storeFile, withTemp } from "./media";
import { editBeat, splitScript, writeCaption, writeScript } from "./providers/claude";
import { demoCaption, demoImages, demoScript, demoSplit, demoVoice } from "./providers/demo";
import { speak, speakTake } from "./providers/elevenlabs";
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
  // the voice reads the words of the pronunciation lexicon as they are said, the screen as they are written
  const lexicon = await pronunciationLexicon(db());
  const said = (t: string | undefined) => (t === undefined ? undefined : spokenText(t, lexicon));
  const audio = providers().voice
    ? await speak(videoId, said(text)!, { previous: said(doc.beats[i - 1]?.text), next: said(doc.beats[i + 1]?.text) })
    : await demoVoice(said(text)!);
  const asset = await ingestVoice(audio, providers().voice ? "elevenlabs" : "démo", providers().voice);
  await mutateDoc(db(), videoId, `voix ${beatId}`, (d) => ({
    ...d,
    assets: { ...d.assets, [asset.id]: asset },
    // if the sentence changed again meanwhile, its own job will voice it
    beats: d.beats.map((b) => (b.id === beatId && b.text === text ? { ...b, voice: asset.id, voiceText: said(text)! } : b)),
  }));
  if (remix) await remixVoice(videoId);
}

/**
 * Voices every beat from one take of the whole script: the reading flows instead of
 * restarting every few words, and each beat still gets its own clip to redo alone.
 */
async function voiceTake(videoId: string) {
  const { doc } = await load(videoId);
  const texts = doc.beats.map((b) => b.text);
  const lexicon = await pronunciationLexicon(db());
  const said = texts.map((t) => spokenText(t, lexicon));
  const take = await speakTake(videoId, said.join(" "));
  // the letter timings follow what was read, so the cuts are found in the read text
  const cuts = takeCuts(said, take.starts, take.ends, take.ends.at(-1)! + 0.5);
  const clips = await sliceTake(take.audio, cuts, "elevenlabs");
  const ids = doc.beats.map((b) => b.id);
  await mutateDoc(db(), videoId, "voix", (d) => ({
    ...d,
    assets: { ...d.assets, ...Object.fromEntries(clips.map((c) => [c.id, c])) },
    // the pauses are already in the take, so the beats sit end to end
    beats: d.beats.map((b) => {
      const k = ids.indexOf(b.id);
      return k >= 0 && b.text === texts[k] ? { ...b, voice: clips[k]!.id, voiceText: said[k]!, gap: 0 } : b;
    }),
  }));
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
      const file = join(dir, `${k}${extname(row.storageKey)}`);
      await storage().download(row.storageKey, file);
      inputs.push("-i", file);
      // in samples (clips are 44.1 kHz), so clips cut from one take meet without a gap or an overlap
      const at = b.startFrame * (44100 / FPS);
      filters.push(`[${k}:a]adelay=${at}S|${at}S[d${k}]`);
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
 * Downloads up to `want` new candidates for a set of beats that share one idea, and says how many came.
 * `select` makes the first new image the shown one (used when Thomas asked for another image).
 * `deeper` reads further down the same searches: the first results are already in the candidates.
 */
export async function imagesFor(videoId: string, beatIds: string[], opts: { queries?: string[]; select?: boolean; want?: number; deeper?: boolean } = {}) {
  const { doc } = await load(videoId);
  const beats = doc.beats.filter((b) => beatIds.includes(b.id));
  const first = beats[0];
  if (!first) return 0;
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
      const pins = opts.deeper ? Math.min(30, want + first.candidates.length) : want;
      for (const q of query.queries) urls.push(...(await searchPinterest(videoId, q, pins)));
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
  if (!added.length) return 0;
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
  return added.length;
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

/**
 * The whole pipeline. Every step is saved as soon as it is done and skipped when
 * it already is, so a retry after a lost connection picks up where it stopped:
 * the script is not paid for twice, voiced lines and found images are kept.
 * It stops three times for Thomas: the script to read, the voice to hear, the shots to check.
 */
export async function generate(videoId: string) {
  const row = await load(videoId);
  await setStatus(db(), videoId, "generating", { step: "Écriture du script", done: 0, total: 1 });

  let beats = row.doc.beats;
  if (!beats.length) {
    const claude = providers().claude;
    const demo = claude ? null : demoScript(row.doc.title, row.doc.artist);
    let script = row.doc.draft ?? null;
    let sources = row.doc.sources;
    if (!script) {
      if (claude) ({ script, sources } = await writeScript(videoId, { title: row.doc.title, artist: row.doc.artist, angle: row.doc.angle }));
      else ({ script, sources } = { script: demo!.beats.map((b) => b.text).join(" "), sources: demo!.sources });
      await mutateDoc(db(), videoId, "script écrit", (d) => ({ ...d, draft: script, sources }));
    }
    // nothing paid goes out until Thomas has read and approved the script
    if (!row.doc.scriptOk) {
      await setStatus(db(), videoId, "review", { step: "Script à valider", done: 0, total: 1 });
      return;
    }
    await setProgress(db(), videoId, { step: "Découpage en plans", done: 0, total: 1 });
    const rows = claude ? await splitScript(videoId, script) : script === demo!.beats.map((b) => b.text).join(" ") ? demo!.beats : demoSplit(script);
    beats = toBeats(rows);
    await mutateDoc(db(), videoId, "script", (d) => ({ ...d, beats, sources, draft: null }));
  }

  // voice: the whole script in one take when nothing is voiced yet
  if (providers().voice && beats.every((b) => !b.voice)) {
    await setProgress(db(), videoId, { step: "Voix off", done: 0, total: beats.length });
    try {
      await voiceTake(videoId);
    } catch (e) {
      console.warn("[voix] prise unique impossible, voix plan par plan :", (e as Error).message);
    }
    beats = (await load(videoId)).doc.beats;
  }
  // then, three sentences at a time, only the lines that do not have theirs yet
  const lexicon = await pronunciationLexicon(db());
  const toVoice = beats.filter((b) => voiceStale(b, lexicon));
  const voiceLimit = pLimit(3);
  let voiced = beats.length - toVoice.length;
  await setProgress(db(), videoId, { step: "Voix off", done: voiced, total: beats.length });
  await Promise.all(
    toVoice.map((b) =>
      voiceLimit(async () => {
        await voiceBeat(videoId, b.id, false);
        await setProgress(db(), videoId, { step: "Voix off", done: ++voiced, total: beats.length });
      }),
    ),
  );
  await remixVoice(videoId);

  // Thomas listens before anything else is spent: the images wait for « Valider la voix »
  if (!(await load(videoId)).doc.voiceOk) {
    await setStatus(db(), videoId, "listen", { step: "Voix à écouter", done: 0, total: 1 });
    return;
  }

  // images: one search per idea, shared by the beats that say it
  const groups: string[][] = [];
  beats.forEach((b, i) => {
    if (b.imageQuery.kind === "none") return;
    const prev = beats[i - 1];
    if (prev && groups.length && prev.imageQuery.kind === b.imageQuery.kind && prev.imageQuery.queries.join() === b.imageQuery.queries.join()) {
      groups.at(-1)!.push(b.id);
    } else groups.push([b.id]);
  });
  // groups that already have images were done before a cut
  const done = new Set((await load(videoId)).doc.beats.filter((b) => b.candidates.length).map((b) => b.id));
  const todo = groups.filter((g) => !g.every((id) => done.has(id)));
  const imageLimit = pLimit(2);
  let found = groups.length - todo.length;
  const failed: { beats: string[]; error: Error }[] = [];
  await Promise.all(
    todo.map((g) =>
      imageLimit(async () => {
        // a budget wall (ours or Apify's) stops every search after it: no use knocking again
        if (!failed.some((f) => f.error instanceof BudgetError)) {
          try {
            await imagesFor(videoId, g);
          } catch (e) {
            console.warn("[images]", g.join(","), (e as Error).message);
            failed.push({ beats: g, error: e as Error });
          }
        }
        await setProgress(db(), videoId, { step: "Images", done: ++found, total: groups.length });
      }),
    ),
  );
  // a video without its images must not go out as a wall of text: stop before the export,
  // and « Reprendre » fetches only the missing ones
  if (failed.length) {
    const found = new Set((await load(videoId)).doc.beats.filter((b) => b.candidates.length).map((b) => b.id));
    const missing = todo.filter((g) => !g.some((id) => found.has(id)));
    const first = failed.find((f) => f.error instanceof BudgetError) ?? failed[0]!;
    const message = `Pas d'images pour ${missing.length} ${missing.length > 1 ? "idées" : "idée"}, à partir de ${missing[0]?.[0] ?? first.beats[0]}. ${first.error.message}`;
    throw first.error instanceof BudgetError ? new BudgetError(message) : new Error(message);
  }
  if (!(await load(videoId)).doc.cover) await coverFor(videoId);
  // a caption that fails does not hold the video back: the « Écrire la légende » button retries it
  if (!(await load(videoId)).doc.caption) await caption(videoId).catch((e) => console.warn("[légende]", (e as Error).message));
  // the montage waits for Thomas too: he checks the shots, then « Monter la vidéo » (which then goes to TikTok)
  await setStatus(db(), videoId, "ready");
}

/** The TikTok caption, from the beats as they read now (so a « Réécrire » follows the edits). */
export async function caption(videoId: string) {
  const { doc } = await load(videoId);
  if (!doc.beats.length) return;
  await setBusy(db(), videoId, "caption", true);
  try {
    const script = doc.beats.map((b) => b.text).join(" ");
    const text = providers().claude ? await writeCaption(videoId, doc, script) : demoCaption(doc.title, doc.artist);
    await mutateDoc(db(), videoId, "légende", (d) => ({ ...d, caption: text }));
  } finally {
    await setBusy(db(), videoId, "caption", false);
  }
}

/** Rewrites the whole script from Thomas's instruction, before he approves it. */
export async function reviseScript(videoId: string, instruction: string) {
  if (!providers().claude) throw new Error("Ajoute ta clé Claude (ANTHROPIC_API_KEY) pour réécrire le script avec une consigne.");
  const { doc } = await load(videoId);
  if (!doc.draft || doc.beats.length) throw new Error("Il n'y a pas de script à valider sur cette vidéo.");
  await setStatus(db(), videoId, "generating", { step: "Réécriture du script", done: 0, total: 1 });
  try {
    const { script, sources } = await writeScript(videoId, doc, { script: doc.draft, instruction });
    await mutateDoc(db(), videoId, "script réécrit", (d) => ({ ...d, draft: script, sources: [...new Set([...d.sources, ...sources])].slice(0, 20) }));
    await setStatus(db(), videoId, "review", { step: "Script à valider", done: 0, total: 1 });
  } catch (e) {
    // the current script stays as it was; Thomas can try again or approve it as is
    await setStatus(db(), videoId, "review", { step: "Script à valider", done: 0, total: 1 }, `La réécriture a échoué : ${(e as Error).message}`);
  }
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
    const { doc } = await load(videoId);
    const beat = doc.beats.find((b) => b.id === beatId)!;
    let added: number;
    if (instruction || beat.imageQuery.kind === "none") {
      // with an instruction, or for a line the split left without a search: new searches from the context
      const ask = instruction ? `Trouve d'autres images : ${instruction}` : "Ce passage n'a pas encore d'image : trouve-lui des images.";
      const queries = providers().claude ? (await editBeat(videoId, beatContext(doc, beatId), ask)).imageQueries : null;
      const plain = (instruction ?? (beat.hero || beat.text)).replace(/[^\p{L}\p{N}' -]/gu, " ").trim();
      added = await imagesFor(videoId, [beatId], { queries: queries?.length ? queries : [plain], select: true, want: 4 });
    } else {
      // no model call: the same searches, further down the results
      added = await imagesFor(videoId, [beatId], { want: 4, deeper: true });
    }
    // the button must not look dead: say so, and how to get something else
    if (!added) await setError(db(), videoId, `Pas de nouvelle image pour ${beatId}. Décris ce que tu veux dans la barre : « @${beatId} une photo de … »`);
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
  // the export is done either way: a send that cannot start shows on its line, or the button stays
  await autoSend(videoId, res.asset.id).catch((e) => console.warn("[tiktok] envoi automatique :", (e as Error).message));
  // a video from before the captions, or whose caption failed, gets one now, ready to paste
  if (!(await load(videoId)).doc.caption) await caption(videoId).catch((e) => console.warn("[légende]", (e as Error).message));
}

/**
 * Each finished export goes to the TikTok inbox by itself, once TikTok is connected
 * (TIKTOK_AUTO_SEND=0 leaves it to the button). An export already sent does not go twice.
 */
export async function autoSend(videoId: string, renderAsset: string) {
  if (env().TIKTOK_AUTO_SEND === "0" || !tiktokConfigured() || !(await tiktokConnected(db()))) return;
  const last = await lastTikTokSend(db(), videoId);
  if (last?.renderAsset === renderAsset && last.status !== "error") return;
  if (await tiktokSendInFlight(db(), videoId)) return;
  const sendId = await createTikTokSend(db(), videoId, renderAsset);
  await enqueue(JOBS.tiktok, { videoId, sendId });
}

