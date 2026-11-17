import { describe, expect, it } from "vitest";
import { formatShare, informationBits, splitByEmphasis, tierOf, weighSharedAnswers } from "./weighting";

describe("inverse frequency weighting", () => {
  it("gives 1 bit to an answer half the pool shares and 2 bits to one a quarter shares", () => {
    expect(informationBits(0.5)).toBeCloseTo(1, 10);
    expect(informationBits(0.25)).toBeCloseTo(2, 10);
    expect(informationBits(1)).toBe(0);
  });

  it("weights rarer answers higher", () => {
    expect(informationBits(0.05)).toBeGreaterThan(informationBits(0.4));
    expect(informationBits(0.4)).toBeGreaterThan(informationBits(0.9));
  });

  it("survives a share of zero or one outside the range", () => {
    expect(Number.isFinite(informationBits(0))).toBe(true);
    expect(informationBits(1.5)).toBe(0);
  });

  it("sets the tiers at a quarter and a half of the pool", () => {
    expect(tierOf(0.25)).toBe("distinctive");
    expect(tierOf(0.26)).toBe("moderate");
    expect(tierOf(0.5)).toBe("moderate");
    expect(tierOf(0.51)).toBe("common");
  });

  it("orders by weight and keeps arrival order for ties", () => {
    const out = weighSharedAnswers([
      { field: "status", value: "single", share_of_pool: 0.915 },
      { field: "pets", value: "has a cat", share_of_pool: 0.08 },
      { field: "diet_type", value: "vegan", share_of_pool: 0.08 },
    ]);
    expect(out.map((a) => a.field)).toEqual(["pets", "diet_type", "status"]);
  });

  it("folds very common answers away from the informative ones", () => {
    const { informative, common } = splitByEmphasis([
      { field: "status", value: "single", share_of_pool: 0.915 },
      { field: "pets", value: "has a cat", share_of_pool: 0.08 },
    ]);
    expect(informative.map((a) => a.field)).toEqual(["pets"]);
    expect(common.map((a) => a.field)).toEqual(["status"]);
  });

  it("does not change the order or the number of the input", () => {
    const input = [
      { field: "status", value: "single", share_of_pool: 0.9 },
      { field: "pets", value: "has a cat", share_of_pool: 0.1 },
    ];
    const copy = structuredClone(input);
    weighSharedAnswers(input);
    expect(input).toEqual(copy);
  });

  it("formats shares for people", () => {
    expect(formatShare(0.915)).toBe("92%");
    expect(formatShare(0.004)).toBe("under 1%");
  });
});
