import { describe, expect, it } from "vitest";
import { balanceRows, takeCuts, toBeats, type Row } from "../src/beats";

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
