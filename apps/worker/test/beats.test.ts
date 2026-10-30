import { describe, expect, it } from "vitest";
import { balanceRows, pickMoves, pickPlaces, takeCuts, toBeats, type Row } from "../src/beats";

const text = (t: string, hero = ""): Row => ({ text: t, hero, layout: "text", imageQuery: { kind: "none", queries: [] } });
const card = (t: string, q: string): Row => ({ text: t, hero: "", layout: "card", imageQuery: { kind: "pinterest", queries: [q] } });

describe("balanceRows", () => {
  it("joins a linking word with the date that follows it", () => {
    const rows = balanceRows([text("Mais au fait,"), text("le 28 janvier 1985,", "28 janvier 1985"), card("Quincy Jones réunit", "quincy")]);
    expect(rows.map((r) => r.text)).toEqual(["Mais au fait, le 28 janvier 1985,", "Quincy Jones réunit"]);
    expect(rows[0]).toMatchObject({ layout: "text", hero: "28 janvier 1985" });
  });

  it("keeps two sentences apart", () => {
    const rows = balanceRows([text("Et il réussit son solo."), text("Franchement, ça me donne des frissons.", "frissons")]);
    expect(rows).toHaveLength(2);
  });

  it("turns a long imageless line into a kinetic block and a short kinetic into text", () => {
    const rows = balanceRows([
      text("C'est ce contraste entre la superstar et le père qui touche."),
      card("une image", "a"),
      { ...text("Un monstre de talent."), layout: "kinetic" },
    ]);
    expect(rows.map((r) => r.layout)).toEqual(["kinetic", "card", "text"]);
  });
});

describe("takeCuts", () => {
  it("cuts halfway through the pause between two beats, on whole frames", () => {
    // "Tu sais ?" spoken 0.2 → 0.8 s, a pause, then "Oui." 1.4 → 1.8 s
    const texts = ["Tu sais ?", "Oui."];
    const text = texts.join(" ");
    const starts: number[] = [];
    const ends: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const t = i < 9 ? 0.2 + (0.6 * i) / 9 : i === 9 ? 0.8 : 1.4 + (0.4 * (i - 10)) / 4;
      starts.push(t);
      ends.push(i < 9 ? 0.2 + (0.6 * (i + 1)) / 9 : i === 9 ? 1.4 : 1.4 + (0.4 * (i - 9)) / 4);
    }
    // first letter at 0.2 s → frame 3; pause 0.8 → 1.4 s, middle 1.1 s → frame 33; end 1.8 + 0.5 s → frame 69
    expect(takeCuts(texts, starts, ends, 2.3)).toEqual([3, 33, 69]);
  });
});

describe("toBeats", () => {
  it("fades about one line in three, never on the vinyl, the mascot or a kinetic block", () => {
    const rows: Row[] = [
      { ...text("Tu connais cette histoire ?"), layout: "vinyl" },
      { ...text("alors abonne-toi pour la suite,"), layout: "mascot" },
      ...Array.from({ length: 9 }, (_, i) => card(`idée numéro ${i}`, `q${i}`)),
      { ...text("une phrase assez longue pour remplir un bloc cinétique entier"), layout: "kinetic" },
    ];
    const beats = toBeats(rows);
    expect(beats.filter((b) => b.reveal === "fade").map((b) => b.layout)).toEqual(["card", "card", "card"]);
    expect(beats.filter((b) => b.layout !== "card").every((b) => b.reveal === "type")).toBe(true);
  });

  it("keeps italics rare: never two in a row, never on the mascot", () => {
    const rows: Row[] = [
      { ...card("Like a Tattoo,", "a"), italic: true },
      { ...card("de Sade", "b"), italic: true },
      { ...text("alors abonne-toi pour la suite,"), layout: "mascot", italic: true },
      { ...card("pour toujours", "c"), italic: true },
    ];
    expect(toBeats(rows).map((b) => b.italic)).toEqual([true, false, false, true]);
  });
});

describe("gestures and placements", () => {
  const story = (): Row[] => [
    card("le paravent lui tombe", "a"),
    card("sur la tête", "b"),
    text("En 1990,", "1990"),
    card("son secret le plus intime", "c"),
    card("reste caché", "c"),
    card("son cœur va se briser", "d"),
    text("Pourtant,"),
    card("chaque soir", "e"),
    card("il chante", "f"),
    text("Franchement,"),
  ];

  it("keeps a gesture only where it can play, spaced out, never twice in a row", () => {
    const rows = story();
    rows[0]!.move = "fall";
    rows[1]!.move = "fall"; // too close
    rows[3]!.move = "fall"; // not the last line of its picture
    rows[4]!.move = "mystery";
    rows[2]!.move = "shatter"; // a text-only line cannot break
    rows[8]!.move = "mystery"; // same as the last one kept
    const moves = pickMoves(rows);
    expect(moves[0]).toBe("fall");
    expect(moves[1]).toBe("none");
    expect(moves[2]).toBe("none");
    expect(moves[3]).toBe("none");
    expect(moves[4]).toBe("mystery");
    expect(moves[8]).toBe("none");
  });

  it("fades a card into the white at a chapter end when the reading gave almost no gesture", () => {
    const moves = pickMoves(story());
    expect(moves.filter((m) => m === "evaporate").length).toBeGreaterThan(0);
    moves.forEach((m, i) => m === "evaporate" && expect(story()[i + 1]!.layout).toBe("text"));
  });

  it("moves text-only lines to the corners, never the same corner twice in a row", () => {
    const rows = Array.from({ length: 8 }, (_, i) => text(`ligne ${i}`));
    const corners = pickPlaces(rows, 3).filter((p) => p !== "hero");
    expect(corners.length).toBe(4);
    corners.slice(1).forEach((p, i) => expect(p).not.toBe(corners[i]));
  });

  it("gives every video its own sequence of entrances", () => {
    const rows = Array.from({ length: 6 }, (_, i) => card(`idée ${i}`, `q${i}`));
    const a = toBeats(rows, 0).map((b) => b.entrance);
    const b = toBeats(rows, 5).map((b) => b.entrance);
    expect(a[0]).toBe("right");
    expect(b).not.toEqual(a);
    expect(new Set(b).size).toBe(6);
  });
});
