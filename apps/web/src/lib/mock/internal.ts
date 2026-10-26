import { TALENTS } from "@/lib/catalogue/data";

// INTERNAL ONLY — stands in for rate cards and rep records (trd §4). Never sent to the UI as-is.

export type InternalTalent = {
  /** Standard selling rate for the talent fee line. */
  sellingRatePaise: bigint;
  /** Share of the talent fee paid out to the talent/rep, in basis points. */
  payoutBps: number;
  repName: string;
};

export function internalFor(slug: string): InternalTalent {
  const talent = TALENTS.find((t) => t.slug === slug);
  const min = BigInt(talent?.feeBandMinPaise ?? "10000000");
  const max = BigInt(talent?.feeBandMaxPaise ?? "20000000");
  // Round the mid-point of the public band to the nearest ₹5,000.
  const mid = (min + max) / 2n;
  const step = 500_000n;
  return {
    sellingRatePaise: ((mid + step / 2n) / step) * step,
    payoutBps: talent?.representationType === "PLATFORM_COORDINATED" ? 7500 : 8000,
    repName: talent?.representationType === "TALENT_MANAGED" ? `${talent.stageName} (self)` : "Partner agency",
  };
}

/** Demo talent logins (AUTH-3: talent accounts exist only by invite — these stand in for invited users). */
export const TALENT_LOGINS: Record<string, string> = {
  "9800000001": "aanya-kapoor",
  "9800000002": "kabir-malhotra",
  "9800000003": "dj-rhea",
};

export const DEMO_CUSTOMER_PHONE = "9876543210";
export const DEMO_OTP = "123456";

export const ACCOUNT_MANAGER = { name: "Riya Sharma", phone: "+91 90000 12345" };
