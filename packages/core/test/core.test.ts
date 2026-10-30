import { describe, expect, it } from "vitest";
import {
  applyBeatPatch,
  buildScenes,
  demoDoc,
  EditError,
  parseCommand,
  previewDocument,
  sceneDocument,
  spokenText,
  textRuns,
  timeBeats,
  voiceStale,
  type ComposeContext,
  type VideoDoc,
} from "../src";

function withImages(doc: VideoDoc): VideoDoc {
  const assets: VideoDoc["assets"] = {};
  const beats = doc.beats.map((b) => {
    if (b.layout !== "card" && b.layout !== "cutout") return b;
    const id = `img-${b.imageQuery.queries[0]?.replace(/\W+/g, "-")}`;
    assets[id] = { id, kind: "image", mime: "image/jpeg", width: 800, height: 1000, accent: "#7c1d1a" };
    return { ...b, image: id, candidates: [id, `${id}-alt`] };
  });
  for (const b of beats) for (const c of b.candidates) assets[c] ??= { id: c, kind: "image", mime: "image/jpeg", width: 800, height: 800 };
  return { ...doc, beats, assets };
}

const ctx = (doc: VideoDoc): ComposeContext => ({ src: (id) => `assets/img/${id}.jpg`, assets: doc.assets });

describe("timing", () => {
  it("chains beats with their gaps and ends after the last word", () => {
    const { beats, total } = timeBeats(demoDoc());
    expect(beats[0]!.start).toBeCloseTo(0.3, 9);
    for (let i = 1; i < beats.length; i++) {
      const lag = beats[i]!.start - (beats[i - 1]!.end + beats[i - 1]!.gap);
      expect(lag).toBeGreaterThanOrEqual(-1e-9);
      expect(lag).toBeLessThan(1 / 30);
      expect(Number.isInteger(beats[i]!.startFrame)).toBe(true);
    }
    expect(total).toBeGreaterThan(beats.at(-1)!.end);
  });
});

describe("scenes", () => {
  const doc = withImages(demoDoc());
  const { scenes, total } = buildScenes(doc);

  it("groups beats that share an image and covers every frame once", () => {
    expect(scenes[0]!.startFrame).toBe(0);
    for (let i = 1; i < scenes.length; i++) expect(scenes[i]!.startFrame).toBe(scenes[i - 1]!.endFrame);
    expect(scenes.at(-1)!.endFrame / 30).toBeCloseTo(total, 3);
    const war = scenes.find((s) => s.beats.some((b) => b.id === "b12"))!;
    expect(war.beats.map((b) => b.id)).toEqual(["b12", "b13"]);
    expect(scenes[0]!.kind).toBe("vinyl");
  });

  it("only changes the scene of the edited beat", () => {
    const before = buildScenes(doc).scenes.map((s) => sceneDocument(s, ctx(doc)));
    const { doc: edited } = applyBeatPatch(doc, "b07", { hero: "née", entrance: "drop" });
    const after = buildScenes(edited).scenes.map((s) => sceneDocument(s, ctx(edited)));
    const changed = before.map((h, i) => h !== after[i]).filter(Boolean).length;
    expect(changed).toBe(1);
  });

  it("keeps later scenes identical when an earlier voice clip gets longer", () => {
    const voiced: VideoDoc = { ...doc, assets: { ...doc.assets, v7: { id: "v7", kind: "audio", mime: "audio/mpeg", duration: 3.5 } } };
    voiced.beats = doc.beats.map((b) => (b.id === "b07" ? { ...b, voice: "v7", voiceText: b.text } : b));
    const before = buildScenes(doc).scenes.map((s) => sceneDocument(s, ctx(doc)));
    const after = buildScenes(voiced).scenes.map((s) => sceneDocument(s, ctx(voiced)));
    const changed = before.map((h, i) => (h !== after[i] ? i : -1)).filter((i) => i >= 0);
    expect(changed.length).toBe(1);
  });

  it("escapes text so a script line cannot inject markup", () => {
    const evil = applyBeatPatch(doc, "b14", { text: '<img src=x onerror="alert(1)">' }).doc;
    const html = previewDocument(evil, ctx(evil), { vendorBase: "/vendor" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;");
  });

  it("writes timeline scripts that parse, with the cover on the vinyl intro and outro", () => {
    const cover = { id: "cover", kind: "image" as const, mime: "image/jpeg", width: 1000, height: 1000 };
    const d = { ...doc, cover: "cover", assets: { ...doc.assets, cover }, beats: doc.beats.map((b, i) => ({ ...b, italic: i % 5 === 1 })) };
    const all = buildScenes(d).scenes;
    for (const s of all) {
      const html = sceneDocument(s, ctx(d), "assets", "kaneda");
      const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
      expect(() => new Function("gsap", "CustomEase", "window", js)).not.toThrow();
    }
    expect(sceneDocument(all[0]!, ctx(d))).toContain('class="sleeve"');
    expect(sceneDocument(all.at(-1)!, ctx(d))).toContain('class="sleeve"');
  });

  it("builds a HyperFrames root for each scene", () => {
    const html = sceneDocument(scenes[5]!, ctx(doc));
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('window.__timelines["main"] = tl');
    expect(html).toContain("assets/gsap.min.js");
  });
});

describe("text runs", () => {
  const beat = demoDoc().beats.find((b) => b.id === "b11")!; // C'est un ancien soldat.
  it("keeps short leads on the hero's baseline and punctuation glued to it", () => {
    const { rows } = textRuns(beat, false);
    expect(rows[0]!.map((r) => r.cls)).toEqual(["light"]);
    expect(rows[1]!.map((r) => r.text)).toEqual(["soldat."]);
    const short = textRuns({ ...beat, text: "C'est la cicatrice", hero: "cicatrice" }, false);
    expect(short.rows[0]!.map((r) => r.cls)).toEqual(["light", "hero"]);
  });
});

describe("edits", () => {
  const doc = withImages(demoDoc());
  it("flags a voice change only when the words change", () => {
    expect(applyBeatPatch(doc, "b07", { hero: "née" }).voiceChanged).toBe(false);
    expect(applyBeatPatch(doc, "b07", { text: "Elle est née dans un club." }).voiceChanged).toBe(true);
  });
  it("refuses an image that was not fetched for the beat", () => {
    expect(() => applyBeatPatch(doc, "b07", { image: "someone-else" })).toThrow(EditError);
  });
  it("reads @beat references in the command bar", () => {
    expect(parseCommand("@b08 plus sombre", "b02")).toEqual({ beatId: "b08", instruction: "plus sombre" });
    expect(parseCommand("plus sombre", "b02")).toEqual({ beatId: "b02", instruction: "plus sombre" });
  });
});

describe("pronunciation", () => {
  const lexicon = { Sade: "Chadé", "Sade Adu": "Chadé Adou", Beyoncé: "Bi-yon-cé" };
  it("says the lexicon words, whole words only, whatever the case", () => {
    expect(spokenText("Like a Tattoo de Sade.", lexicon)).toBe("Like a Tattoo de Chadé.");
    expect(spokenText("SADE chante, Sadeness non.", lexicon)).toBe("Chadé chante, Sadeness non.");
    expect(spokenText("Sade Adu et Beyoncé", lexicon)).toBe("Chadé Adou et Bi-yon-cé");
  });
  it("marks the voice stale when the lexicon changes how a line is read", () => {
    const beat = { ...demoDoc().beats[0]!, text: "de Sade", voice: "v1", voiceText: "de Sade" };
    expect(voiceStale(beat)).toBe(false);
    expect(voiceStale(beat, lexicon)).toBe(true);
    expect(voiceStale({ ...beat, voiceText: "de Chadé" }, lexicon)).toBe(false);
  });
});
