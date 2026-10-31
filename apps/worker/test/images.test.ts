import { describe, expect, it } from "vitest";
import { plainQuery } from "../src/providers/images";

describe("plainQuery", () => {
  it("drops quotes and punctuation and keeps six words at most", () => {
    expect(plainQuery(`"Sade" Smooth Operator, 1984 : live à Montreux (concert) noir et blanc`)).toBe("Sade Smooth Operator 1984 live à");
  });

  it("keeps accents and apostrophes", () => {
    expect(plainQuery("l'été de Françoise Hardy")).toBe("l'été de Françoise Hardy");
  });
});
