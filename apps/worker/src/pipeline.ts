import { applyBeatPatch, beatContext, FPS, spokenText, timeBeats, voiceStale, type Asset, type Beat, type VideoDoc } from "@regie/core";
import { createTikTokSend, getAsset, getDb, getVideo, lastTikTokSend, mutateDoc, pronunciationLexicon, setBusy, setError, setProgress, setRendered, setStatus, tiktokSendInFlight } from "@regie/db";
import { BudgetError, enqueue, env, JOBS, providers, storage, tiktokConfigured, tiktokConnected } from "@regie/server";
import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import pLimit from "p-limit";
import { hasChecker, removeBackground, removeChecker } from "./background";
import { drawStyle, takeCuts, toBeats } from "./beats";
import { animatedGif, ff, ingestClip, ingestImage, ingestVoice, sliceTake, storeFile, withTemp } from "./media";
import { editBeat, splitScript, writeCaption, writeScript } from "./providers/claude";
import { demoCaption, demoImages, demoScript, demoSplit, demoVoice } from "./providers/demo";
import { speak, speakTake } from "./providers/elevenlabs";
import { deezerCover, fetchImage, searchPinterest } from "./providers/images";
import { exportVideo, prerenderScenes } from "./render";

const db = () => getDb();

async function load(videoId: string) {
  const row = await getVideo(db(), videoId);
  if (!row) throw new Error(`vidéo ${videoId} introuvable`);
  return row;
}

/** Wraps a one-beat job so the line shows a spinner while it runs, then gets the changed scene made ahead. */
async function onBeat<T>(videoId: string, beatId: string, fn: () => Promise<T>): Promise<T> {
  await setBusy(db(), videoId, beatId, true);
  try {
    return await fn();
  } finally {
    await setBusy(db(), videoId, beatId, false);
    await enqueue(JOBS.prerender, { videoId });
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
 * Stores a downloaded pin. A pin with a flattened checkerboard is stored with its cut-out
 * version, which is the one shown; one that cannot be cut cleanly is dropped, so a fake
 * background never reaches the video.
 */
async function ingestPin(buf: Buffer, url: string): Promise<Asset[]> {
  if (!(await hasChecker(buf))) return [await ingestImage(buf, url)];
  const cut = await removeChecker(buf);
  if (!cut) throw new Error("damier impossible à détourer");
  const clean = await ingestImage(cut, `${url}#sans-fond`);
  return [{ ...(await ingestImage(buf, url)), checker: true, clean: clean.id }, clean];
}

/** The version of a candidate that is shown by default: cut out when it came on a checkerboard. */
const shown = (a: Asset) => (a.checker && a.clean ? a.clean : a.id);

/** Words added to a search for « Autres images », one more per click. */
const VARIANTS = ["vintage", "aesthetic", "photo", "close up", "black and white", "editorial", "film still", "candid"];

/**
 * Downloads up to `want` new candidates for a set of beats that share one idea, and says how many came.
 * `select` makes the first new image the shown one (used when Thomas asked for another image).
 * `fresh` varies the same searches (« … vintage », « … aesthetic »…), so another click brings other
 * pins for the same price: Apify bills every pin it returns, so asking for more is not the way.
 */
export async function imagesFor(videoId: string, beatIds: string[], opts: { queries?: string[]; select?: boolean; want?: number; fresh?: boolean } = {}) {
  const { doc } = await load(videoId);
  const beats = doc.beats.filter((b) => beatIds.includes(b.id));
  const first = beats[0];
  if (!first) return 0;
  const query = opts.queries?.length ? { kind: "pinterest" as const, queries: opts.queries } : first.imageQuery;
  const known = new Set(Object.values(doc.assets).map((a) => a.source));
  const want = opts.want ?? 6;
  const added: Asset[] = [];
  // cut-out versions of the added images: stored with them, never candidates themselves
  const cutouts: Asset[] = [];

  if (query.kind === "cover") {
    const url = await deezerCover(doc.title, doc.artist);
    if (url && !known.has(url)) added.push(await ingestImage(await fetchImage(url), url));
  } else if (query.kind === "pinterest") {
    if (providers().images) {
      const urls: string[] = [];
      const variant = opts.fresh ? ` ${VARIANTS[Math.floor(first.candidates.length / want) % VARIANTS.length]}` : "";
      // the next search of the idea only when the ones before did not bring enough new pins:
      // most ideas fill up on their first search, and every pin returned is billed
      for (const q of query.queries) {
        if (new Set(urls.filter((u) => !known.has(u))).size >= want) break;
        urls.push(...(await searchPinterest(videoId, q + variant, want, known)));
      }
      for (const url of [...new Set(urls)].filter((u) => !known.has(u))) {
        if (added.length >= want) break;
        try {
          const [image, clean] = await ingestPin(await fetchImage(url), url);
          added.push(image!);
          if (clean) cutouts.push(clean);
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
    assets: { ...d.assets, ...Object.fromEntries([...added, ...cutouts].map((a) => [a.id, a])) },
    beats: d.beats.map((b) => {
      if (!beatIds.includes(b.id)) return b;
      const candidates = [...added.map((a) => a.id), ...b.candidates.filter((c) => !added.some((a) => a.id === c))].slice(0, 24);
      const image = opts.select || !b.image ? shown(added[0]!) : b.image;
      // a cut-out is posed on the white, not framed in a card
      const cut = image !== b.image && image !== added[0]!.id;
      return { ...b, imageQuery: query, candidates, image, layout: cut && b.layout === "card" ? "cutout" : b.layout };
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
    const split = claude
      ? await splitScript(videoId, script)
      : { beats: script === demo!.beats.map((b) => b.text).join(" ") ? demo!.beats : demoSplit(script), mood: "lumineux" as const };
    // the video's own draw: where the entrances start, which lines stress how, black and white for a dark story
    const seed = randomInt(1, 1_000_000);
    const { zoom, exit } = drawStyle(seed);
    const look = { seed, mono: split.mood === "sombre", zoom, exit };
    beats = toBeats(split.beats, look.seed);
    await mutateDoc(db(), videoId, "script", (d) => ({ ...d, beats, look, sources, draft: null }));
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
  // « je cherche moi-même » : only the album cover (Deezer, free) is fetched, the rest waits on La Planche
  const manual = Boolean((await load(videoId)).doc.manualImages);
  const todo = groups.filter((g) => !g.every((id) => done.has(id)) && (!manual || beats.find((b) => b.id === g[0])!.imageQuery.kind === "cover"));
  // four ideas at a time (Apify runs five at most): the same searches, just sooner
  const imageLimit = pLimit(4);
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
  let notice: string | null = null;
  if (failed.length) {
    const found = new Set((await load(videoId)).doc.beats.filter((b) => b.candidates.length).map((b) => b.id));
    const missing = todo.filter((g) => !g.some((id) => found.has(id)));
    const first = failed.find((f) => f.error instanceof BudgetError) ?? failed[0]!;
    const message = `Pas d'images pour ${missing.length} ${missing.length > 1 ? "idées" : "idée"}, à partir de ${missing[0]?.[0] ?? first.beats[0]}. ${first.error.message}`;
    if (!(first.error instanceof BudgetError)) throw new Error(message);
    // over budget the video is not stuck: Thomas puts his own pictures on those lines (free), then mounts it
    notice = `${message} Mets tes propres images avec « Ma photo » dans ces plans, puis « Envoyer sur TikTok ».`;
  }
  if (!(await load(videoId)).doc.cover) await coverFor(videoId);
  // a caption that fails does not hold the video back: the « Écrire la légende » button retries it
  if (!(await load(videoId)).doc.caption) await caption(videoId).catch((e) => console.warn("[légende]", (e as Error).message));
  // the montage waits for Thomas too: he checks the shots, then « Envoyer sur TikTok » (which makes the file, then sends it);
  // meanwhile the scenes are made ahead, so that click has little left to do
  await setStatus(db(), videoId, "ready", null, notice);
  // by hand, the scenes are made ahead as the pictures come in (each « Ma photo » starts it)
  if (!manual) await enqueue(JOBS.prerender, { videoId });
}

/** The head start (see prerenderScenes): runs while the video waits at « ready », stops at the first change. */
export async function prerender(videoId: string) {
  const start = await load(videoId);
  if (start.status !== "ready" || start.doc.beats.some((b) => !b.voice)) return;
  const n = await prerenderScenes(videoId, start.doc, async () => {
    const now = await load(videoId);
    return now.status === "ready" && now.version === start.version;
  });
  if (n) console.log(`[prerender] ${videoId}: ${n} plans montés en avance`);
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
      // no model call: the same searches, varied, four pins each
      added = await imagesFor(videoId, [beatId], { want: 4, fresh: true });
    }
    // the button must not look dead: say so, and how to get something else
    if (!added) await setError(db(), videoId, `Pas de nouvelle image pour ${beatId}. Décris ce que tu veux dans la barre : « @${beatId} une photo de … »`);
  });
}

/**
 * « Fond nettoyé » on the image a beat shows: cuts its background out (the checkerboard when
 * there is one, rembg otherwise), keeps the original for « Original », and shows the cut-out.
 */
/**
 * An image Thomas uploaded for a beat (when the search found nothing, or the budget ran out):
 * cleaned like any other (decoded, stripped, resized), put first among the candidates and shown.
 * `also`: the other beats of the same idea (La Planche gives one picture to the whole idea).
 * A GIF or a short video becomes a silent looping clip, always shown in a card.
 */
export async function ownImage(videoId: string, beatId: string, key: string, also: string[] = [], mime?: string) {
  const ids = new Set([beatId, ...also]);
  await onBeat(videoId, beatId, async () => {
    try {
      const file = await storage().read(key);
      const moving = mime?.startsWith("video/") || (mime === "image/gif" && (await animatedGif(file)));
      const { clip, poster } = moving ? await ingestClip(file, mime!, "moi") : { clip: null, poster: null };
      const asset = clip ?? (await ingestImage(file, "moi"));
      await mutateDoc(db(), videoId, `${[...ids].join(",")} : ${clip ? "mon extrait" : "ma photo"}`, (d) => ({
        ...d,
        assets: { ...d.assets, [asset.id]: asset, ...(poster ? { [poster.id]: poster } : {}) },
        beats: d.beats.map((b) =>
          ids.has(b.id)
            ? {
                ...b,
                image: asset.id,
                candidates: [asset.id, ...b.candidates.filter((c) => c !== asset.id)],
                // a clip has no cut-out: it plays in a card
                layout: clip ? ("card" as const) : b.layout === "card" || b.layout === "cutout" ? b.layout : ("card" as const),
              }
            : b,
        ),
      }));
    } finally {
      await storage().remove(key).catch(() => {});
    }
  });
}

export async function cleanImage(videoId: string, beatId: string) {
  await onBeat(videoId, beatId, async () => {
    const { doc } = await load(videoId);
    const beat = doc.beats.find((b) => b.id === beatId);
    const original = beat?.candidates.find((c) => c === beat.image || doc.assets[c]?.clean === beat.image);
    if (!beat || !original) throw new Error(`Le plan ${beatId} n'a pas d'image à détourer.`);
    if (doc.assets[original]?.kind === "video") throw new Error("Un GIF ou une vidéo ne se détoure pas : il reste dans sa carte.");
    let cleanId = doc.assets[original]?.clean;
    let clean: Asset | undefined;
    if (!cleanId) {
      const row = await getAsset(db(), original);
      if (!row) throw new Error("Image introuvable.");
      clean = await ingestImage(await removeBackground(await storage().read(row.storageKey)), `${doc.assets[original]?.source ?? original}#sans-fond`);
      cleanId = clean.id;
    }
    await mutateDoc(db(), videoId, `${beatId} : fond nettoyé`, (d) => ({
      ...d,
      assets: clean ? { ...d.assets, [clean.id]: clean, [original]: { ...d.assets[original]!, clean: clean.id } } : d.assets,
      beats: d.beats.map((b) => (b.id === beatId ? { ...b, image: cleanId!, layout: b.layout === "card" ? ("cutout" as const) : b.layout } : b)),
    }));
  });
}

export async function revoice(videoId: string, beatId: string) {
  await onBeat(videoId, beatId, () => voiceBeat(videoId, beatId));
}

export async function render(videoId: string) {
  const row = await load(videoId);
  if (row.doc.beats.some((b) => !b.voice)) throw new Error("Toutes les phrases n'ont pas encore de voix.");
  await setStatus(db(), videoId, "rendering", { step: "Montage", done: 0, total: 1 });
  // a line whose reading changed since its voice (a pronunciation added on another video…) is voiced again first,
  // so the export never carries the old reading
  const lexicon = await pronunciationLexicon(db());
  const stale = row.doc.beats.filter((b) => voiceStale(b, lexicon));
  let revoiced = 0;
  for (const [k, b] of stale.entries()) {
    await setProgress(db(), videoId, { step: "Voix à refaire", done: k, total: stale.length });
    try {
      await voiceBeat(videoId, b.id, false);
      revoiced++;
    } catch (e) {
      // over budget, the line keeps its last voice: a video with an old reading beats no video
      if (!(e instanceof BudgetError)) throw e;
      console.warn(`[render] ${videoId} ${b.id} : voix gardée, ${e.message}`);
      break;
    }
  }
  if (revoiced) await remixVoice(videoId);
  const doc = revoiced ? (await load(videoId)).doc : row.doc;
  const res = await exportVideo(videoId, doc, (done, total) => setProgress(db(), videoId, { step: "Montage des plans", done, total }));
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

