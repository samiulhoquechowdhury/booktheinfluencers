import { describe, expect, it } from "vitest";
import { computeQuoteTotals, lineTaxPaise, splitIntoMilestones } from "./quote";

describe("lineTaxPaise", () => {
  it("applies the rate in basis points", () => {
    expect(lineTaxPaise({ customerAmountPaise: 10_000_000n, taxRateBps: 1800 })).toBe(1_800_000n);
  });

  it("rounds half-up to the paisa", () => {
    // 18% of ₹0.25 = 4.5 paise → 5
    expect(lineTaxPaise({ customerAmountPaise: 25n, taxRateBps: 1800 })).toBe(5n);
    // 18% of ₹0.22 = 3.96 paise → 4
    expect(lineTaxPaise({ customerAmountPaise: 22n, taxRateBps: 1800 })).toBe(4n);
    // 18% of ₹0.02 = 0.36 paise → 0
    expect(lineTaxPaise({ customerAmountPaise: 2n, taxRateBps: 1800 })).toBe(0n);
  });

  it("supports zero-rated lines", () => {
    expect(lineTaxPaise({ customerAmountPaise: 99_999n, taxRateBps: 0 })).toBe(0n);
  });

  it("rejects negative amounts", () => {
    expect(() => lineTaxPaise({ customerAmountPaise: -1n, taxRateBps: 1800 })).toThrow(RangeError);
  });
});

describe("computeQuoteTotals", () => {
  it("sums rounded line taxes, not the tax of the sum", () => {
    const lines = [
      { customerAmountPaise: 25n, taxRateBps: 1800 },
      { customerAmountPaise: 25n, taxRateBps: 1800 },
    ];
    // Each line rounds 4.5 → 5, so 10 — taxing the 50-paise sum would give 9.
    expect(computeQuoteTotals(lines)).toEqual({ subtotalPaise: 50n, taxPaise: 10n, totalPaise: 60n });
  });

  it("handles an empty quote", () => {
    expect(computeQuoteTotals([])).toEqual({ subtotalPaise: 0n, taxPaise: 0n, totalPaise: 0n });
  });
});

describe("splitIntoMilestones", () => {
  const halves = [
    { label: "Advance", percentBps: 5000 },
    { label: "Balance", percentBps: 5000 },
  ];

  it("splits evenly when it can", () => {
    expect(splitIntoMilestones(1_000n, halves)).toEqual([
      { label: "Advance", amountPaise: 500n },
      { label: "Balance", amountPaise: 500n },
    ]);
  });

  it("gives the remainder to the last milestone so parts add up", () => {
    const parts = splitIntoMilestones(1_001n, [
      { label: "A", percentBps: 3333 },
      { label: "B", percentBps: 3333 },
      { label: "C", percentBps: 3334 },
    ]);
    expect(parts.map((part) => part.amountPaise)).toEqual([333n, 333n, 335n]);
    expect(parts.reduce((sum, part) => sum + part.amountPaise, 0n)).toBe(1_001n);
  });

  it("requires the plan to total 100%", () => {
    expect(() => splitIntoMilestones(100n, [{ label: "Advance", percentBps: 5000 }])).toThrow(RangeError);
  });
});
