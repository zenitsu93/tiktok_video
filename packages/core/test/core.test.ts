import { describe, expect, it } from "vitest";
import {
  addCovers,
  applyBeatPatch,
  chooseCover,
  coverChoices,
  applyStyle,
  buildScenes,
  coverTitleSize,
  demoDoc,
  EditError,
  parseCommand,
  previewDocument,
  sceneDocument,
  snapshotStyle,
  spokenText,
  textRuns,
  textWords,
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

  it("plays a clip muted in a card, without the zoom of a still", () => {
    const card = scenes.find((s) => s.kind === "card" && s.image)!;
    const id = card.image!;
    const clipDoc = { ...doc, assets: { ...doc.assets, [id]: { ...doc.assets[id]!, kind: "video" as const, mime: "video/mp4" } } };
    const html = sceneDocument(card, ctx(clipDoc));
    expect(html).toMatch(/<div class="card"><video src="[^"]+" muted playsinline/);
    expect(html).not.toContain(`#s${card.index} img`);
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

  it("opens and closes on the « bac à disques » cover: hook, title in Black Italic, artist", () => {
    const cover = { id: "cover", kind: "image" as const, mime: "image/jpeg", width: 1000, height: 1000 };
    const d = { ...doc, title: "Like a Tattoo", artist: "Sade", cover: "cover", assets: { ...doc.assets, cover } };
    const all = buildScenes(d).scenes;
    for (const s of [all[0]!, all.at(-1)!]) {
      const html = sceneDocument(s, ctx(d), "assets", "kaneda");
      expect(html).toContain("Like a Tattoo,</div>");
      expect(html).toContain("de Sade ?</div>");
    }
    // the opening shows the cover from frame 0 instead of typing its lines
    const intro = sceneDocument(all[0]!, ctx(d));
    expect(intro).not.toMatch(/id="s0b\d+"/);
    expect(intro).toContain('tl.fromTo("#s0 .sleeve",{x:-120,rotation:-3,opacity:1}');
    // the ending fades the cover lines in late without blanking its first frame
    expect(sceneDocument(all.at(-1)!, ctx(d))).toContain("immediateRender:false");
    expect(coverTitleSize("Like a Tattoo")).toBe(190);
    expect(coverTitleSize("We Are the World")).toBeLessThan(190);
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

  it("keeps the French space marks and the quotes with the hero, never alone on a row", () => {
    const colon = textRuns({ ...beat, text: "Il l'appelle Earth Song : un cri", hero: "Earth Song", place: "hero" }, false);
    expect(colon.rows.flat().map((r) => r.text)).toEqual(["Il l'appelle", "Earth Song\u00a0:", "un cri"]);
    const quoted = textRuns({ ...beat, text: "Il hurle « What About Us »", hero: "What About Us", place: "hero" }, false);
    expect(quoted.rows.flat().map((r) => r.text)).toEqual(["Il hurle", "«\u00a0What About Us\u00a0»"]);
    const straight = textRuns({ ...beat, text: 'Il hurle "What About Us" !', hero: "What About Us", place: "size" }, false);
    expect(straight.rows.flat().map((r) => r.text)).toEqual(["Il hurle", '"What About Us"\u00a0!']);
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
  it("accepts the cut-out version of one of the beat's images", () => {
    const b = doc.beats.find((x) => x.candidates.length)!;
    const c = b.candidates[0]!;
    const cut = { id: "cut1", kind: "image" as const, mime: "image/png" };
    const withCut = { ...doc, assets: { ...doc.assets, [c]: { ...doc.assets[c]!, clean: "cut1" }, cut1: cut } };
    expect(applyBeatPatch(withCut, b.id, { image: "cut1", layout: "cutout" }).doc.beats.find((x) => x.id === b.id)!.image).toBe("cut1");
    expect(() => applyBeatPatch(doc, b.id, { image: "cut1" })).toThrow(EditError);
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

describe("gestures", () => {
  const base = () => withImages(demoDoc());
  const firstCard = (doc: VideoDoc) => doc.beats.findIndex((b) => b.layout === "card");

  it("leaves a video without gestures exactly as before", () => {
    const doc = base();
    const html = previewDocument(doc, ctx(doc), { vendorBase: "v" });
    expect(html).not.toContain('class="mono"');
    expect(html).not.toContain("card shard");
  });

  it("plays a full screen as its own scene, with white text", () => {
    const doc = base();
    const i = firstCard(doc);
    doc.beats[i] = { ...doc.beats[i]!, move: "fullscreen" };
    const { scenes } = buildScenes(doc);
    const s = scenes.find((x) => x.beats[0]!.id === doc.beats[i]!.id)!;
    expect(s.beats).toHaveLength(1);
    const html = sceneDocument(s, ctx(doc));
    expect(html).toContain('class="full"');
    expect(html).toContain('color:"#ffffff"');
  });

  it("breaks a card into four pieces on its last line", () => {
    const doc = base();
    const i = firstCard(doc);
    doc.beats[i] = { ...doc.beats[i]!, move: "shatter" };
    const s = buildScenes(doc).scenes.find((x) => x.beats.at(-1)!.id === doc.beats[i]!.id);
    if (!s) return;
    const html = sceneDocument(s, ctx(doc));
    expect(html.match(/class="card shard/g)).toHaveLength(4);
  });

  it("puts every picture in black and white for a dark story", () => {
    const doc = { ...base(), look: { seed: 7, mono: true } };
    expect(previewDocument(doc, ctx(doc), { vendorBase: "v" })).toContain('<div id="root" class="mono"');
  });

  it("stresses a hero of several words small + big on one row", () => {
    const { rows } = textRuns({ ...demoDoc().beats[5]!, text: "et pourtant chaque soir", hero: "chaque soir", place: "size", italic: false }, false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.map((r) => r.cls)).toEqual(["small", "big"]);
  });
});

describe("styles", () => {
  it("puts an earlier montage back exactly, look included", () => {
    const doc = withImages(demoDoc());
    const first = { ...doc, look: { seed: 3, mono: false } };
    const style = snapshotStyle(first);
    const second: VideoDoc = {
      ...first,
      look: { seed: 9, mono: true, zoom: "push" },
      beats: first.beats.map((b) => ({ ...b, entrance: "drop" as const, place: "topright" as const })),
      styles: [style],
      styleIndex: 1,
    };
    const back = applyStyle(second, 0);
    expect(back.look).toEqual(first.look);
    expect(back.styleIndex).toBe(0);
    expect(back.beats.map((b) => [b.entrance, b.place ?? null])).toEqual(first.beats.map((b) => [b.entrance, b.place ?? null]));
    expect(back.beats.map((b) => b.text)).toEqual(first.beats.map((b) => b.text));
    expect(() => applyStyle(second, 4)).toThrow("Ce style n'existe pas.");
  });
});

describe("textWords", () => {
  it("glues every mark to its word, so none can stand alone on a line", () => {
    expect(textWords("Il l'appelle Earth Song : un cri ?")).toEqual(["Il", "l'appelle", "Earth", "Song :", "un", "cri ?"]);
    expect(textWords("Il hurle « What About Us »")).toEqual(["Il", "hurle", "« What", "About", "Us »"]);
    expect(textWords('Il dit " non " puis')).toEqual(["Il", "dit", '" non "', "puis"]);
  });
});

describe("pochette", () => {
  const img = (id: string) => ({ id, kind: "image" as const, mime: "image/jpeg", width: 1000, height: 1000 });
  const base = (): VideoDoc => {
    const d = demoDoc();
    const beats = d.beats.map((b, i) => (i === 3 ? { ...b, image: "old", candidates: ["old"] } : b));
    return { ...d, cover: "old", beats, assets: { ...d.assets, old: img("old"), p1: img("p1"), p2: img("p2") } as VideoDoc["assets"] };
  };
  it("adds found sleeves to the choices without changing the cover", () => {
    const d = addCovers(base(), ["p1", "p2"]);
    expect(d.cover).toBe("old");
    expect(coverChoices(d)).toEqual(["p1", "p2", "old"]);
  });
  it("puts the chosen sleeve on the video and on the lines that showed the old one", () => {
    const d = chooseCover(addCovers(base(), ["p1"]), "p1");
    expect(d.cover).toBe("p1");
    expect(d.beats[3]!.image).toBe("p1");
    expect(d.beats[3]!.candidates[0]).toBe("p1");
    expect(addCovers(base(), ["p2"], true).cover).toBe("p2");
  });
  it("refuses an image that is not one of the sleeves", () => {
    expect(() => chooseCover(base(), "p1")).toThrow(EditError);
  });
});
