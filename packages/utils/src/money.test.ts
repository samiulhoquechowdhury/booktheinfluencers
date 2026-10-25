import { describe, expect, it } from "vitest";
import { formatINR } from "./money";

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(12345600n)).toBe("₹1,23,456");
    expect(formatINR(1000000000n)).toBe("₹1,00,00,000");
  });

  it("shows paise only when present", () => {
    expect(formatINR(150n)).toBe("₹1.50");
    expect(formatINR(5n)).toBe("₹0.05");
  });

  it("handles zero and negatives", () => {
    expect(formatINR(0n)).toBe("₹0");
    expect(formatINR(-250075n)).toBe("-₹2,500.75");
  });

  it("stays exact beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatINR(900719925474099312n)).toBe("₹9,00,71,99,25,47,40,993.12");
  });
});
