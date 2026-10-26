import { TALENTS } from "./catalogue/data";

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

// ---------- Staff (apps/admin) ----------

export const STAFF_ROLES = ["SUPER_ADMIN", "SALES", "TALENT_MANAGER", "OPS", "ACCOUNTS"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffUser = { id: string; name: string; email: string; roles: StaffRole[] };

/** Demo staff accounts (AUTH-2). Password for all: STAFF_DEMO_PASSWORD; authenticator code: DEMO_OTP. */
export const STAFF_USERS: StaffUser[] = [
  { id: "stf_admin", name: "Kavya Rao", email: "admin@demo.in", roles: ["SUPER_ADMIN"] },
  { id: "stf_sales", name: "Riya Sharma", email: "sales@demo.in", roles: ["SALES"] },
  { id: "stf_talent", name: "Imran Khan", email: "talent@demo.in", roles: ["TALENT_MANAGER"] },
  { id: "stf_ops", name: "Dev Patel", email: "ops@demo.in", roles: ["OPS"] },
  { id: "stf_accounts", name: "Meena Iyer", email: "accounts@demo.in", roles: ["ACCOUNTS"] },
];
export const STAFF_DEMO_PASSWORD = "demo1234";

/** QUO-6: below these, a quote needs SUPER_ADMIN approval (placeholder floor — docs/memory.md open question). */
export const QUOTE_MARGIN_FLOOR_BPS = 1000;
export const MINIMUM_RATE_BPS = 8500;

export const minimumRateFor = (slug: string) => (internalFor(slug).sellingRatePaise * BigInt(MINIMUM_RATE_BPS)) / 10_000n;
