import { describe, expect, it } from "vitest";
import { planPrimary, type PrimaryConfig } from "./botEngine";

const base: PrimaryConfig = {
  kind: "over", batch: true, digit: 5, digits: [2, 4], stakeMode: "each",
  stakes: { "2": 1, "4": 0 }, durationMode: "each", durations: { "2": 3 },
};

describe("batch contracts", () => {
  it("buys one contract per selected digit with its own stake and ticks", () => {
    const plan = planPrimary(base, 0.5, 0.5, 1);
    expect(plan).toEqual([
      { type: "DIGITOVER", barrier: 2, stake: 1, duration: 3 },
      { type: "DIGITOVER", barrier: 4, stake: 0.5, duration: 1 },
    ]);
  });
  it("batch off trades a single digit at the app stake", () => {
    const plan = planPrimary({ ...base, batch: false }, 0.5, 1, 2);
    expect(plan).toEqual([{ type: "DIGITOVER", barrier: 5, stake: 1, duration: 2 }]);
  });
});
