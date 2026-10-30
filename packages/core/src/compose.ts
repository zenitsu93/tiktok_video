import type { Asset, Beat, Entrance, VideoDoc } from "./schema";
import { FPS, round, timeBeats, toFrame, type TimedBeat } from "./timing";

/**
 * Turns a video document into HyperFrames HTML, following the montage-tiktok-thomas skill.
 *
 * The video is cut into scenes (one image held across consecutive beats, or one
 * text-only beat). Each scene is rendered on its own and the MP4s are joined, so a
 * change to one beat only re-renders its scene. The same scene markup, shifted to
 * absolute time, builds the live preview of the whole video.
 */

export const W = 1080;
export const H = 1920;
const CARD_CY = 720;
const INK = "#111111";
const GREY = "#c8c8c8";

export type SceneKind = "card" | "cutout" | "text" | "kinetic" | "vinyl" | "mascot";

export interface Scene {
  index: number;
  kind: SceneKind;
  image: string | null;
  beats: TimedBeat[];
  /** Frame-accurate bounds, so joined scenes never drift from the voice. */
  startFrame: number;
  endFrame: number;
  /** Vinyl scenes with a cover: the song, for the "bac à disques" cover that opens and closes the video. */
  song?: { title: string; artist: string; hook: string };
}

export const sceneStart = (s: Scene) => s.startFrame / FPS;
export const sceneDuration = (s: Scene) => (s.endFrame - s.startFrame) / FPS;

export function buildScenes(doc: VideoDoc): { scenes: Scene[]; total: number } {
  const { beats, total } = timeBeats(doc);
  const groups: { kind: SceneKind; image: string | null; beats: TimedBeat[] }[] = [];
  for (const b of beats) {
    const kind = b.layout as SceneKind;
    const image = kind === "vinyl" ? doc.cover : kind === "card" || kind === "cutout" ? b.image : null;
    const prev = groups.at(-1);
    const joinable = kind === "card" || kind === "cutout" || kind === "vinyl" || kind === "mascot";
    if (prev && joinable && prev.kind === kind && prev.image === image) {
      prev.beats.push(b);
    } else {
      groups.push({ kind: kind === "card" && !image ? "text" : kind, image, beats: [b] });
    }
  }
  const totalFrames = toFrame(total);
  // a scene opens 3 frames before its first word, so the image lands on the word
  const starts = groups.map((g, i) => (i === 0 ? 0 : Math.max(0, g.beats[0]!.startFrame - 3)));
  const scenes: Scene[] = groups.map((g, i) => ({
    index: i,
    kind: g.kind,
    image: g.image,
    beats: g.beats,
    startFrame: starts[i]!,
    endFrame: i + 1 < groups.length ? starts[i + 1]! : totalFrames,
    ...(g.kind === "vinyl" && g.image ? { song: { title: doc.title, artist: doc.artist, hook: groups[0]!.beats[0]!.text } } : {}),
  }));
  return { scenes: scenes.filter((s) => s.endFrame > s.startFrame), total: totalFrames / FPS };
}

/** Which scene shows a given beat. */
export function sceneOfBeat(scenes: Scene[], beatId: string): Scene | undefined {
  return scenes.find((s) => s.beats.some((b) => b.id === beatId));
}

export interface ComposeContext {
  /** URL or relative path for an asset. */
  src: (id: string) => string;
  assets: Record<string, Asset>;
}

interface Parts {
  html: string[];
  js: string[];
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const t3 = (n: number) => round(n).toString();

/** Hero direction pairs from the skill: image entrance -> (linking words, hero word). */
const TEXT_DIRS: Record<Entrance, [Dir, Dir]> = {
  pop: ["bottom", "zoom"],
  right: ["right", "bottom"],
  left: ["left", "bottom"],
  rise: ["bottom", "bottom"],
  drop: ["top", "zoom"],
  zoomin: ["zoom", "bottom"],
  glide: ["left", "right"],
  grow: ["bottom", "zoom"],
};
const FOLLOW_DIRS: [Dir, Dir][] = [
  ["bottom", "zoom"],
  ["left", "bottom"],
  ["zoom", "right"],
  ["right", "bottom"],
];
type Dir = "bottom" | "top" | "left" | "right" | "zoom";
const DIR_FROM: Record<Dir, string> = {
  bottom: "{y:140,opacity:0}",
  top: "{y:-140,opacity:0}",
  left: "{x:-320,opacity:0}",
  right: "{x:320,opacity:0}",
  zoom: "{scale:1.6,opacity:0}",
};

function entranceJs(sel: string, e: Entrance, t: number): string[] {
  const T = t3(t);
  switch (e) {
    case "pop":
      return [
        `tl.fromTo("${sel}",{scale:0},{scale:1.06,duration:0.3,ease:"back.out(1.6)"},${T});`,
        `tl.to("${sel}",{scale:1,duration:0.18,ease:"smooth"},${t3(t + 0.3)});`,
      ];
    case "grow":
      return [
        `tl.fromTo("${sel}",{scale:0.85,opacity:0},{scale:1.04,opacity:1,duration:0.32,ease:"smooth"},${T});`,
        `tl.to("${sel}",{scale:1,duration:0.25,ease:"inout"},${t3(t + 0.32)});`,
      ];
    case "rise":
      return [`tl.fromTo("${sel}",{y:620,opacity:0},{y:0,opacity:1,duration:0.5,ease:"smooth"},${T});`];
    case "drop":
      return [`tl.fromTo("${sel}",{y:-620,opacity:0},{y:0,opacity:1,duration:0.5,ease:"smooth"},${T});`];
    case "zoomin":
      return [`tl.fromTo("${sel}",{scale:1.45,opacity:0},{scale:1,opacity:1,duration:0.45,ease:"smooth"},${T});`];
    case "right":
      return [`tl.fromTo("${sel}",{x:760,scale:0.6,rotation:8},{x:0,scale:1,rotation:0,duration:0.5,ease:"smooth"},${T});`];
    case "left":
      return [`tl.fromTo("${sel}",{x:-760,scale:0.6,rotation:-8},{x:0,scale:1,rotation:0,duration:0.5,ease:"smooth"},${T});`];
    case "glide":
      return [`tl.fromTo("${sel}",{x:-500,y:250},{x:0,y:0,duration:0.45,ease:"smooth"},${T});`];
  }
}

type Run = { cls: "light" | "bold" | "hero" | "spoken" | "spokenb"; text: string; it?: boolean };

/** Splits a beat into styled runs around its hero word. */
export function textRuns(beat: Beat, spoken: boolean): { rows: Run[][]; heroOffset: number } {
  const out = plainRuns(beat, spoken);
  if (!beat.italic) return out;
  // one italic element per screen: the hero when there is one, otherwise the line, in Light Italic
  const runs = out.rows.flat();
  const hero = runs.find((r) => r.cls === "hero" || r.cls === "spokenb");
  if (hero) hero.it = true;
  else for (const r of runs) {
    r.it = true;
    if (r.cls === "bold") r.cls = "light";
  }
  return out;
}

function plainRuns(beat: Beat, spoken: boolean): { rows: Run[][]; heroOffset: number } {
  const text = beat.text.trim();
  const hero = beat.hero.trim();
  const at = hero ? text.toLowerCase().indexOf(hero.toLowerCase()) : -1;
  if (spoken) {
    if (at < 0) return { rows: [[{ cls: "spoken", text }]], heroOffset: -1 };
    const before = text.slice(0, at).trim();
    let after = text.slice(at + hero.length);
    const punct = /^[,.;:?!…]+/.exec(after)?.[0] ?? "";
    after = after.slice(punct.length).trim();
    const runs: Run[] = [];
    if (before) runs.push({ cls: "spoken", text: before });
    runs.push({ cls: "spokenb", text: text.slice(at, at + hero.length) + punct });
    if (after) runs.push({ cls: "spoken", text: after });
    return { rows: [runs], heroOffset: at };
  }
  if (at < 0) return { rows: [[{ cls: "bold", text }]], heroOffset: -1 };
  const before = text.slice(0, at).trim();
  let after = text.slice(at + hero.length);
  const punct = /^[,.;:?!…]+/.exec(after)?.[0] ?? "";
  after = after.slice(punct.length).trim();
  const heroRun: Run = { cls: "hero", text: text.slice(at, at + hero.length) + punct };
  const rows: Run[][] = [];
  const beforeWords = before ? before.split(/\s+/).length : 0;
  // One or two linking words share the hero's baseline; longer leads go on the line above.
  if (beforeWords > 0 && beforeWords <= 2) rows.push([{ cls: "light", text: before }, heroRun]);
  else {
    if (before) rows.push([{ cls: "light", text: before }]);
    rows.push([heroRun]);
  }
  if (after) rows.push([{ cls: "light", text: after }]);
  return { rows, heroOffset: at };
}

function chars(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="w">${[...w].map((c) => `<span class="ch">${esc(c)}</span>`).join("")}</span>`)
    .join(" ");
}

/** Builds one scene's clips. `base` shifts every time (0 for a render, scene start for the preview). */
function sceneParts(scene: Scene, ctx: ComposeContext, base: number): Parts {
  const html: string[] = [];
  const js: string[] = [];
  const s0 = base;
  const dur = sceneDuration(scene);
  const sid = `s${scene.index}`;
  // times inside a scene come from whole-frame offsets, so a scene that only moved renders identically
  const local = (b: TimedBeat) => (b.startFrame - scene.startFrame) / FPS + base;
  const first = scene.beats[0]!;
  const asset = scene.image ? ctx.assets[scene.image] : undefined;
  const accent = asset?.accent ?? null;

  // ---- visual: card / cutout / vinyl / mascot
  let textTop: number | null = null;
  let textLeft: number | null = null;
  if ((scene.kind === "card" || scene.kind === "cutout") && scene.image && asset) {
    const iw = asset.width ?? 1000;
    const ih = asset.height ?? 1250;
    let w = scene.kind === "cutout" ? 560 : 710;
    let h = Math.round((w * ih) / iw);
    if (h > 760) {
      h = 760;
      w = Math.round((h * iw) / ih);
    }
    const left = Math.round((W - w) / 2);
    const top = CARD_CY - Math.round(h / 2);
    textTop = top + h + 46;
    textLeft = scene.kind === "card" ? left : null;
    const cls = scene.kind === "card" ? "card" : "cut";
    html.push(
      `<div id="${sid}" class="clip" data-start="${t3(s0)}" data-duration="${t3(dur)}" data-track-index="${1 + (scene.index % 2)}">` +
        `<div class="inner" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px">` +
        `<div class="${cls}"><img src="${esc(ctx.src(scene.image))}" alt=""></div></div></div>`,
    );
    js.push(...entranceJs(`#${sid} .inner`, first.entrance, s0));
    // soft zoom on the picture for the whole hold, alternating in and out
    const [z0, z1] = scene.index % 2 === 0 ? [1, 1.12] : [1.12, 1];
    const zc = scene.kind === "cutout" ? [1, 1.05] : [z0, z1];
    js.push(`tl.fromTo("#${sid} img",{scale:${zc[0]}},{scale:${zc[1]},duration:${t3(dur)},ease:"sine.inOut"},${t3(s0)});`);
    // collapse to a point at the end of the idea (every other scene, the rest cut to white)
    if (dur > 0.9 && scene.index % 2 === 0) {
      js.push(`tl.to("#${sid} .inner",{scale:0,duration:0.15,ease:"inquick"},${t3(s0 + dur - 0.17)});`);
    }
  } else if (scene.kind === "vinyl") {
    const cover = scene.image && ctx.assets[scene.image] ? esc(ctx.src(scene.image)) : null;
    const label = cover ? `<img src="${cover}" alt="">` : "";
    const sleeve = cover ? `<div class="sleeve" style="left:${(W - 600) / 2}px;top:0"><img src="${cover}" alt=""></div>` : "";
    html.push(
      `<div id="${sid}" class="clip" data-start="${t3(s0)}" data-duration="${t3(dur)}" data-track-index="5">` +
        `<div class="stage"><div class="inner" style="left:${(W - 600) / 2}px;top:0;width:600px;height:600px">` +
        `<div class="disc"><div class="label">${label}</div></div></div>${sleeve}</div></div>`,
    );
    js.push(`tl.fromTo("#${sid} .disc",{rotation:0},{rotation:${Math.round(160 * dur)},duration:${t3(dur)},ease:"none"},${t3(s0)});`);
    if (!cover) js.push(...entranceJs(`#${sid} .inner`, "pop", s0));
    else {
      // the "bac à disques" cover: complete on frame 0 (it is the TikTok cover) and again on the last frame (the loop)
      const song = scene.song ?? { title: "", artist: "", hook: "" };
      html.push(coverHtml(sid, song, s0, dur));
      js.push(...(scene.index === 0 ? coverIntroJs(sid, s0, dur) : coverOutroJs(sid, s0, dur)));
    }
  } else if (scene.kind === "mascot") {
    html.push(
      `<div id="${sid}" class="clip" data-start="${t3(s0)}" data-duration="${t3(dur)}" data-track-index="5">` +
        `<div class="inner" style="left:${(W - 240) / 2}px;top:560px;width:240px;height:264px">${MASCOT_SVG}</div></div>`,
    );
    js.push(...entranceJs(`#${sid} .inner`, "pop", s0));
  }

  // ---- text, one clip per beat
  scene.beats.forEach((b, k) => {
    // the opening cover already shows the hook, the title and the artist while the voice says them
    if (scene.kind === "vinyl" && scene.song && scene.index === 0) return;
    const bid = `${sid}${b.id}`;
    const start = k === 0 && scene.index === 0 ? s0 : Math.max(s0, local(b) - 0.02);
    const isLastInScene = k === scene.beats.length - 1;
    // the vinyl hook line stays above the record while the title types below it
    const holdAll = scene.kind === "vinyl" && k === 0 && scene.beats.length > 1;
    const endAbs = holdAll || isLastInScene ? s0 + dur : local(scene.beats[k + 1]!) - 0.02;
    const tdur = Math.max(0.05, endAbs - start);
    const speak = Math.max(0.3, b.end - b.start);
    const t0 = local(b);
    const color = b.accent && accent ? accent : INK;

    if (scene.kind === "kinetic") {
      html.push(kineticHtml(bid, b, start, tdur, k));
      kineticJs(bid, b, t0, speak).forEach((l) => js.push(l));
      return;
    }

    const spoken = scene.kind === "mascot" || scene.kind === "vinyl";
    const { rows } = textRuns(scene.kind === "vinyl" && k > 0 && b.hero ? { ...b, italic: true } : b, spoken);
    let pos: string;
    let blockCls = "block";
    if (scene.kind === "vinyl") {
      pos = k === 0 ? "top:400px" : "top:1170px";
      if (k > 0) blockCls += " title";
    }
    else if (scene.kind === "mascot") pos = "top:880px";
    else if (textTop !== null) pos = `top:${textTop}px`;
    else pos = "top:0;bottom:0;align-items:center";
    if (textLeft !== null) {
      pos += `;justify-content:flex-start;padding-left:${textLeft}px;padding-right:60px`;
    } else blockCls += " center";

    const rowsHtml = rows
      .map(
        (row) =>
          `<div class="row">${row
            .map((r, ri) => {
              // never italic and accent colour on the same word
              const style = (r.cls === "hero" || r.cls === "spokenb") && !r.it ? ` style="color:${color}"` : "";
              return `<span class="part ${r.cls}${r.it ? " it" : ""} p${ri}"${style}>${chars(r.text)}</span>`;
            })
            .join("")}</div>`,
      )
      .join("");
    html.push(
      `<div id="${bid}" class="clip" data-start="${t3(start)}" data-duration="${t3(tdur)}" data-track-index="${3 + (k % 2)}">` +
        `<div class="tinner" style="${pos}"><div class="${blockCls}">${rowsHtml}</div></div></div>`,
    );

    // block settles into place while letters type
    js.push(`tl.fromTo("#${bid} .block",{y:24,scale:0.97},{y:0,scale:1,duration:0.4,ease:"smooth"},${t3(start)});`);
    const [dirText, dirHero] =
      k === 0 && (scene.kind === "card" || scene.kind === "cutout")
        ? TEXT_DIRS[first.entrance]
        : FOLLOW_DIRS[(scene.index + k) % FOLLOW_DIRS.length]!;
    const total = b.text.length;
    let offset = 0;
    rows.flat().forEach((r) => {
      const tPart = t0 + speak * (offset / Math.max(1, total));
      const partSel = `#${bid} .part.${r.cls}`;
      const dir = r.cls === "hero" ? dirHero : dirText;
      if (!spoken) js.push(`tl.fromTo("${partSel}",${DIR_FROM[dir]},{x:0,y:0,scale:1,opacity:1,duration:0.45,ease:"smooth"},${t3(tPart)});`);
      const target = (r.cls === "hero" || r.cls === "spokenb") && !r.it ? color : INK;
      if (b.reveal === "fade") {
        js.push(`tl.fromTo("${partSel} .ch",{opacity:0},{opacity:1,duration:0.01},${t3(start)});`);
        js.push(`tl.fromTo("${partSel} .ch",{color:"${GREY}"},{color:"${target}",duration:0.15},${t3(tPart)});`);
      } else {
        const n = Math.max(1, r.text.replace(/\s/g, "").length);
        const partSpeak = speak * (r.text.length / Math.max(1, total));
        const stg = round((partSpeak * 0.92) / n, 10000);
        js.push(`tl.fromTo("${partSel} .ch",{opacity:0,color:"${GREY}"},{opacity:1,color:"${target}",duration:0.06,stagger:${stg}},${t3(tPart)});`);
      }
      offset += r.text.length + 1;
    });
    // make room: the card rises a little when its first line arrives
    if (k === 0 && (scene.kind === "card" || scene.kind === "cutout") && first.entrance !== "rise" && first.entrance !== "drop") {
      js.push(`tl.fromTo("#${sid} .inner",{y:90},{y:0,duration:0.25,ease:"smooth"},${t3(Math.max(s0 + 0.35, t0 + 0.05))});`);
    }
  });
  return { html, js };
}

/** Kaneda Black Italic advance widths at 100 px, to fit the cover title to 840 px without measuring in the page. */
const BLACK_IT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.'’!?-&éèêàçùôîïëâÉÈÀ:()";
const BLACK_IT_W = [
  32, 33, 31, 33, 31, 21, 33, 33, 17, 17, 33, 17, 49, 33, 32, 33, 33, 24, 30, 21, 33, 30, 48, 31, 33, 29, 33, 34, 32, 34, 29, 28, 34, 34, 18, 32, 35, 27, 50,
  37, 34, 33, 34, 34, 32, 30, 34, 32, 50, 33, 32, 31, 33, 23, 31, 32, 34, 32, 33, 30, 32, 33, 14, 17, 17, 17, 17, 17, 30, 25, 40, 31, 31, 31, 32, 31, 33, 32,
  17, 17, 31, 32, 29, 29, 33, 17, 20, 20,
];

/** Cover title size: the title and its comma fill 840 px, never above 190 px. */
export function coverTitleSize(title: string): number {
  const w = [...`${title},`].reduce((sum, c) => sum + (BLACK_IT_W[BLACK_IT_CHARS.indexOf(c)] ?? 31), 0);
  return Math.min(190, Math.floor((840 * 100) / Math.max(1, w)));
}

/** Hook, title (Black Italic) and artist, aligned left at 120 px (SPEC.md, « Couverture bac à disques »). */
function coverHtml(sid: string, song: { title: string; artist: string; hook: string }, s0: number, dur: number): string {
  const size = coverTitleSize(song.title);
  return (
    `<div id="${sid}c" class="clip" data-start="${t3(s0)}" data-duration="${t3(dur)}" data-track-index="6">` +
    `<div class="cline" style="top:330px;font-size:68px">${esc(song.hook)}</div>` +
    `<div class="cline it" style="top:1180px;font-size:${size}px;font-weight:700;line-height:1">${esc(song.title)},</div>` +
    `<div class="cline" style="top:${1180 + Math.round(size * 0.95)}px;font-size:76px">de ${esc(song.artist)} ?</div></div>`
  );
}

/** Opening: the cover holds (the record keeps sliding out), then the texts lift off, the sleeve flies away and the record shrinks to a dot. */
function coverIntroJs(sid: string, s0: number, dur: number): string[] {
  const f = Math.min(1, dur / 2.2);
  const hold = Math.max(0.3, dur - 1.1 * f);
  const at = (t: number) => t3(s0 + hold + t * f);
  const d = (t: number) => t3(t * f);
  return [
    // fromTo, not set: a set at 0 is not drawn by seek(0), and frame 0 is the TikTok cover
    `tl.fromTo("#${sid} .sleeve",{x:-120,rotation:-3,opacity:1},{x:-120,rotation:-3,opacity:1,duration:0.01},${t3(s0)});`,
    `tl.fromTo("#${sid} .inner",{x:90},{x:130,duration:${t3(hold)},ease:"inout"},${t3(s0)});`,
    `tl.to("#${sid}c .cline",{y:-40,opacity:0,filter:"blur(10px)",duration:${d(0.4)},ease:"inquick",stagger:${d(0.06)}},${at(0)});`,
    `tl.to("#${sid} .sleeve",{x:-1000,rotation:-16,opacity:0,duration:${d(0.6)},ease:"inquick"},${at(0)});`,
    `tl.to("#${sid} .inner",{x:0,duration:${d(0.7)},ease:"inout"},${at(0)});`,
    `tl.to("#${sid} .stage",{scale:0,duration:${d(0.3)},ease:"inquick"},${at(0.75)});`,
  ];
}

/** Ending: the record pops in, the last line is said, then the cover comes back exactly as on frame 0 so the loop is seamless. */
function coverOutroJs(sid: string, s0: number, dur: number): string[] {
  const g = Math.min(1.55, dur * 0.6) / 1.55;
  const e = s0 + dur;
  const at = (t: number) => t3(Math.max(s0, e - t * g));
  const d = (t: number) => t3(t * g);
  // fromTo after the start: immediateRender:false, or they would blank the scene's first frame
  return [
    `tl.fromTo("#${sid} .sleeve",{x:-1000,rotation:-16,opacity:0},{x:-1000,rotation:-16,opacity:0,duration:0.01},${t3(s0)});`,
    `tl.fromTo("#${sid}c .cline",{opacity:0},{opacity:0,duration:0.01},${t3(s0)});`,
    `tl.fromTo("#${sid} .stage",{scale:0},{scale:1.06,duration:0.3,ease:"back.out(1.6)"},${t3(s0)});`,
    `tl.to("#${sid} .stage",{scale:1,duration:0.18,ease:"smooth"},${t3(s0 + 0.3)});`,
    `tl.to("[id^='${sid}b'] .tinner",{y:-40,opacity:0,filter:"blur(10px)",duration:${d(0.4)},ease:"inquick"},${at(1.55)});`,
    `tl.to("#${sid} .sleeve",{x:-120,rotation:-3,opacity:1,duration:${d(0.5)},ease:"smooth"},${at(1.55)});`,
    `tl.to("#${sid} .inner",{x:90,duration:${d(0.5)},ease:"inout"},${at(1.55)});`,
    `tl.fromTo("#${sid}c .cline",{y:40,opacity:0,filter:"blur(10px)"},{y:0,opacity:1,filter:"blur(0px)",duration:${d(0.5)},ease:"smooth",stagger:${d(0.08)},immediateRender:false},${at(1.2)});`,
  ];
}

function kineticLines(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const n = Math.min(5, Math.max(3, Math.round(words.length / 3)));
  const per = text.length / n;
  const lines: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.join(" ").length >= per && lines.length < n - 1) {
      lines.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) lines.push(cur.join(" "));
  return lines;
}

function kineticHtml(bid: string, b: Beat, start: number, dur: number, k: number): string {
  const lines = kineticLines(b.text);
  const hero = b.hero.toLowerCase();
  const html = lines
    .map((l, i) => {
      // every line has the same width, so the font size follows the line length
      const size = Math.max(60, Math.min(200, Math.round(820 / (l.length * 0.43))));
      const it = b.italic && i === lines.length - 1;
      const weight = it ? 300 : hero && l.toLowerCase().includes(hero) ? 700 : i % 2 === 0 ? 300 : 700;
      return `<div class="kline${it ? " it" : ""}" style="font-size:${size}px;font-weight:${weight}">${chars(l)}</div>`;
    })
    .join("");
  return (
    `<div id="${bid}" class="clip" data-start="${t3(start)}" data-duration="${t3(dur)}" data-track-index="${3 + (k % 2)}">` +
    `<div class="tinner" style="top:0;bottom:0;align-items:center"><div class="block kinetic">${html}</div></div></div>`
  );
}

function kineticJs(bid: string, b: Beat, t0: number, speak: number): string[] {
  const lines = kineticLines(b.text);
  const out: string[] = [];
  let offset = 0;
  lines.forEach((l, i) => {
    const t = t0 + speak * (offset / Math.max(1, b.text.length));
    const sel = `#${bid} .kline:nth-child(${i + 1})`;
    out.push(`tl.fromTo("${sel}",{y:140,scale:0.7,opacity:0},{y:0,scale:1,opacity:1,duration:0.4,ease:"smooth"},${t3(t)});`);
    out.push(`tl.fromTo("${sel} .ch",{color:"${GREY}"},{color:"${INK}",duration:0.15},${t3(t + 0.2)});`);
    offset += l.length + 1;
  });
  return out;
}

const MASCOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="100%" height="100%"><circle cx="100" cy="95" r="80" fill="#f2b632"/><ellipse cx="68" cy="95" rx="24" ry="26" fill="#2b1a10"/><ellipse cx="132" cy="95" rx="24" ry="26" fill="#2b1a10"/><circle cx="60" cy="86" r="8" fill="#fff"/><circle cx="124" cy="86" r="8" fill="#fff"/><path d="M40 62 Q60 50 82 60" stroke="#7a4a12" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M118 60 Q140 50 160 62" stroke="#7a4a12" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M88 140 Q100 132 112 140" stroke="#7a4a12" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;

/** Weights the layouts use; each brand font provides one file per weight (see brandFonts in @regie/server). */
export const FONT_WEIGHTS = [200, 300, 400, 600, 700] as const;
/** Italic weights (Light and Black); Kaneda only, Oswald falls back to a slanted roman. */
export const ITALIC_WEIGHTS = [300, 700] as const;
/** Kaneda Gothic when its files are installed locally, Oswald otherwise. */
export type FontName = "kaneda" | "oswald";

export interface DocumentOptions {
  /** Where gsap.min.js, CustomEase.min.js and fonts/brand-{weight}.font live ("assets" in a render). */
  vendorBase: string;
  /** Which font the brand files are; part of the HTML so a font change re-renders every scene. */
  font?: FontName;
  duration: number;
  audio?: string;
  extraHead?: string;
  extraBody?: string;
}

function documentHtml(parts: Parts, o: DocumentOptions): string {
  const v = o.vendorBase.replace(/\/$/, "");
  const fonts =
    `/* font: ${o.font ?? "oswald"} */\n` +
    FONT_WEIGHTS.map((w) => `@font-face{font-family:"Brand";font-weight:${w};font-display:block;src:url("${v}/fonts/brand-${w}.font")}`).join("\n") +
    (o.font === "kaneda"
      ? "\n" + ITALIC_WEIGHTS.map((w) => `@font-face{font-family:"Brand";font-style:italic;font-weight:${w};font-display:block;src:url("${v}/fonts/brand-${w}i.font")}`).join("\n")
      : "");
  const audio = o.audio
    ? `<audio id="vo" src="${esc(o.audio)}" data-start="0" data-duration="${t3(o.duration)}" data-track-index="0"></audio>`
    : "";
  return `<!doctype html>
<html lang="fr" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="${v}/gsap.min.js"></script>
<script src="${v}/CustomEase.min.js"></script>
<style>
${fonts}
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:${W}px; height:${H}px; overflow:hidden; background:#ffffff; }
#root { width:${W}px; height:${H}px; position:relative; background:#ffffff; color:${INK}; font-family:"Brand","Arial Narrow",sans-serif; }
.clip { position:absolute; inset:0; }
.inner { position:absolute; transform-origin:50% 50%; }
.card { width:100%; height:100%; border-radius:7%/5.6%; overflow:hidden; }
.card img { width:100%; height:100%; object-fit:cover; display:block; }
.cut img { width:100%; height:100%; object-fit:contain; display:block; }
.disc { width:100%; height:100%; border-radius:50%; background:repeating-radial-gradient(circle,#151515 0 6px,#232323 6px 8px); display:flex; align-items:center; justify-content:center; }
.stage { position:absolute; left:0; top:520px; width:${W}px; height:600px; transform-origin:50% 50%; }
.sleeve { position:absolute; width:600px; height:600px; border-radius:18px; overflow:hidden; box-shadow:0 30px 60px rgba(0,0,0,.18); transform-origin:50% 50%; }
.sleeve img { width:100%; height:100%; object-fit:cover; display:block; }
.label { width:38%; height:38%; border-radius:50%; overflow:hidden; background:#d6381c; }
.label img { width:100%; height:100%; object-fit:cover; display:block; }
.tinner { position:absolute; left:0; width:${W}px; display:flex; justify-content:center; }
.block { max-width:960px; text-align:left; transform-origin:50% 0%; display:flex; flex-direction:column; gap:6px; }
.block.center { align-items:center; text-align:center; }
.row { display:flex; align-items:baseline; gap:0 22px; flex-wrap:wrap; }
.block.center .row { justify-content:center; }
.part { display:inline-block; }
.light { font-weight:300; font-size:80px; line-height:1; }
.bold { font-weight:600; font-size:78px; line-height:1; }
.hero { font-weight:700; font-size:190px; line-height:.86; }
.spoken { font-weight:400; font-size:68px; line-height:1.05; }
.spokenb { font-weight:700; font-size:68px; line-height:1.05; }
.title .spoken, .title .spokenb { font-size:104px; line-height:1; }
.kinetic { align-items:center; gap:0; }
.kline { line-height:.95; white-space:nowrap; }
.w { display:inline-block; white-space:nowrap; }
.it { font-style:italic; }
.cline { position:absolute; left:120px; font-weight:400; white-space:nowrap; }
</style>
${o.extraHead ?? ""}
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${t3(o.duration)}" data-width="${W}" data-height="${H}" data-fps="${FPS}" data-layout-allow-overlap>
${audio}
${parts.html.join("\n")}
</div>
<script>
gsap.registerPlugin(CustomEase);
CustomEase.create("smooth","0.22,1,0.36,1");
CustomEase.create("inout","0.65,0,0.35,1");
CustomEase.create("inquick","0.55,0,1,0.45");
const tl = gsap.timeline({ paused: true });
${parts.js.join("\n")}
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
${o.extraBody ?? ""}
</body>
</html>
`;
}

/** Standalone HyperFrames project HTML for one scene (times start at 0, no audio). */
export function sceneDocument(scene: Scene, ctx: ComposeContext, vendorBase = "assets", font: FontName = "oswald"): string {
  return documentHtml(sceneParts(scene, ctx, 0), { vendorBase, font, duration: sceneDuration(scene) });
}

/** The whole video as one document, for the live preview in the browser. */
export function previewDocument(
  doc: VideoDoc,
  ctx: ComposeContext,
  o: { vendorBase: string; font?: FontName; audio?: string; extraHead?: string; extraBody?: string },
): string {
  const { scenes, total } = buildScenes(doc);
  const all: Parts = { html: [], js: [] };
  for (const s of scenes) {
    const p = sceneParts(s, ctx, sceneStart(s));
    all.html.push(...p.html);
    all.js.push(...p.js);
  }
  return documentHtml(all, { ...o, duration: total });
}

/** Asset ids a scene needs on disk to render. */
export function sceneAssets(scene: Scene): string[] {
  return scene.image ? [scene.image] : [];
}
