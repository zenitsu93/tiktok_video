import { describe, expect, it } from "vitest";
import { demoDoc, keywords, libraryForIdea, putFromLibrary, sameIdea, searchLibrary, type Asset } from "../src";

const entry = (assetId: string, words: string, text = "") => ({ assetId, words, text });
const shelf = [
  entry("mic", "vintage studio microphone micro", "Il entre au studio, le micro est allumé"),
  entry("deck", "record player turntable vinyl", "Le disque tourne"),
  entry("crowd", "concert crowd stadium 1985", "Une foule immense"),
  entry("mj", "michael jackson studio 1982", "Michael enregistre"),
];

describe("library matching", () => {
  it("drops the words that do not tell pictures apart", () => {
    expect(keywords("Vintage studio microphone, black and white photo")).toEqual(["studio", "microphone"]);
    expect(keywords("Années 80 : la foule")).toEqual(["annees", "foule"]);
  });

  it("finds the same idea by two shared words, prefixes included", () => {
    expect(sameIdea(["old studio microphones"], keywords(shelf[0]!.words))).toBe(true);
    // one shared word is not the same idea…
    expect(sameIdea(["studio session"], keywords(shelf[0]!.words))).toBe(false);
    // …unless the idea has only one word
    expect(sameIdea(["microphone vintage"], keywords(shelf[0]!.words))).toBe(true);
    expect(libraryForIdea(shelf, ["stadium concert crowd at night"]).map((e) => e.assetId)).toEqual(["crowd"]);
    expect(libraryForIdea(shelf, ["aesthetic vintage photo"])).toEqual([]);
    // as a suggestion to pick from, one shared word is enough, the closest first
    expect(libraryForIdea(shelf, ["turntable spinning slowly"])).toEqual([]);
    expect(libraryForIdea(shelf, ["turntable spinning slowly"], 6, true).map((e) => e.assetId)).toEqual(["deck"]);
    expect(libraryForIdea(shelf, ["michael jackson studio session"], 6, true).map((e) => e.assetId)).toEqual(["mj", "mic"]);
  });

  it("searches in French in the line, every typed word counting", () => {
    expect(searchLibrary(shelf, "micro").map((e) => e.assetId)).toEqual(["mic"]);
    expect(searchLibrary(shelf, "foule").map((e) => e.assetId)).toEqual(["crowd"]);
    expect(searchLibrary(shelf, "studio").map((e) => e.assetId).sort()).toEqual(["mic", "mj"]);
    expect(searchLibrary(shelf, "studio michael").map((e) => e.assetId)).toEqual(["mj"]);
    expect(searchLibrary(shelf, "")).toHaveLength(4);
  });
});

describe("putFromLibrary", () => {
  const pic: Asset = { id: "mic", kind: "image", mime: "image/jpeg", clean: "mic-cut", source: "https://i.pinimg.com/originals/a.jpg" };
  const cut: Asset = { id: "mic-cut", kind: "image", mime: "image/png" };

  it("puts the picture first on the idea's lines, cut out when it was kept cut out", () => {
    const doc = demoDoc();
    const ids = doc.beats.slice(1, 3).map((b) => b.id);
    const next = putFromLibrary(doc, { assetId: "mic", files: [pic, cut], cut: true }, ids);
    for (const id of ids) {
      const b = next.beats.find((x) => x.id === id)!;
      expect(b.image).toBe("mic-cut");
      expect(b.candidates[0]).toBe("mic");
      expect(b.layout).toBe("cutout");
    }
    expect(next.assets.mic?.library).toBe(true);
    expect(next.assets["mic-cut"]).toBeTruthy();
    expect(next.beats[0]).toEqual(doc.beats[0]);
  });

  it("shows the plain picture in a card when it was kept as it was", () => {
    const doc = demoDoc();
    const b = putFromLibrary(doc, { assetId: "mic", files: [pic, cut], cut: false }, [doc.beats[1]!.id]).beats[1]!;
    expect(b.image).toBe("mic");
    expect(b.layout).toBe("card");
  });
});
