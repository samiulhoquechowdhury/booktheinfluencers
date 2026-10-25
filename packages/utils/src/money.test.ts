import { describe, expect, it } from "vitest";
import { formatINR, formatINRCompact } from "./money";

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

describe("formatINRCompact", () => {
  it("uses thousands, lakhs and crores", () => {
    expect(formatINRCompact(8000000n)).toBe("₹80k");
    expect(formatINRCompact(30000000n)).toBe("₹3L");
    expect(formatINRCompact(1200000000n)).toBe("₹1.2Cr");
  });

  it("rounds down to one decimal", () => {
    expect(formatINRCompact(15000000n)).toBe("₹1.5L");
    expect(formatINRCompact(19990000n)).toBe("₹1.9L");
  });

  it("groups large crore values the Indian way", () => {
    expect(formatINRCompact(1500000000000n)).toBe("₹1,500Cr");
  });

  it("falls back to the full form under ₹1,000", () => {
    expect(formatINRCompact(49900n)).toBe("₹499");
    expect(formatINRCompact(0n)).toBe("₹0");
  });

  it("keeps the sign", () => {
    expect(formatINRCompact(-25000000n)).toBe("-₹2.5L");
  });
});
