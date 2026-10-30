import { demoDoc, type VideoDoc } from "@regie/core";
import { describe, expect, it } from "vitest";
import { shotsToKeep } from "../src/library";

describe("shotsToKeep", () => {
  it("keeps the picture each shot went out with, as found, with its idea's words", () => {
    const base = demoDoc();
    const [b1, b2, b3] = base.beats.slice(1, 4);
    const doc: VideoDoc = {
      ...base,
      assets: {
        pin: { id: "pin", kind: "image", mime: "image/jpeg", clean: "pin-cut", source: "https://i.pinimg.com/x.jpg" },
        "pin-cut": { id: "pin-cut", kind: "image", mime: "image/png" },
        other: { id: "other", kind: "image", mime: "image/jpeg", source: "https://i.pinimg.com/y.jpg" },
        demo: { id: "demo", kind: "image", mime: "image/jpeg", source: "démo:b01:1:0" },
      },
      beats: base.beats.map((b) => {
        if (b.id === b1!.id) return { ...b, layout: "cutout", image: "pin-cut", candidates: ["other", "pin"], hero: "Micro", imageQuery: { kind: "pinterest", queries: ["Vintage studio microphone"] } };
        if (b.id === b2!.id) return { ...b, layout: "card", image: "demo", candidates: ["demo"] };
        if (b.id === b3!.id) return { ...b, layout: "text", image: "other", candidates: ["other"] };
        return { ...b, image: null, candidates: [] };
      }),
    };
    const kept = shotsToKeep(doc);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ assetId: "pin", cut: true, label: "Micro", words: "vintage studio microphone micro" });
    expect(kept[0]!.files.map((f) => f.id)).toEqual(["pin", "pin-cut"]);
  });
});
