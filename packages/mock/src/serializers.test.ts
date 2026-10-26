import { describe, expect, it } from "vitest";
import { CustomerLeadSchema } from "@repo/schemas";
import { buildSeed } from "./seed";
import { toCustomerLead, toTalentBooking } from "./serializers";

// rules.md §7: forbidden fields must be absent per role.
const keysDeep = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((item) => keysDeep(item, found));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      keysDeep(child, found);
    }
  }
  return found;
};

describe("customer serializer", () => {
  const db = buildSeed();

  it("never exposes margin, payout, internal costs or pipeline internals", () => {
    for (const lead of db.leads) {
      const keys = keysDeep(toCustomerLead(db, lead));
      for (const forbidden of ["internalCostPaise", "marginPaise", "payoutTotalPaise", "payoutBps", "ownerName", "lostReason", "stage", "acceptedIp"]) {
        expect(keys.has(forbidden), `${forbidden} leaked on ${lead.ref}`).toBe(false);
      }
    }
  });

  it("hides staff-only timeline notes", () => {
    const lead = db.leads[0]!;
    const internal = db.activities.filter((a) => a.leadId === lead.id && a.internal).map((a) => a.title);
    expect(internal.length).toBeGreaterThan(0);
    const shown = toCustomerLead(db, lead).timeline.map((t) => t.title);
    for (const title of internal) expect(shown).not.toContain(title);
  });

  it("rejects a DTO with an internal field slipped in", () => {
    // Simulates a serializer bug: the strict schema refuses unknown keys anywhere in the tree.
    const dto = toCustomerLead(db, db.leads[0]!);
    const leaky = structuredClone(dto) as unknown as { bookings: { quotes: { lineItems: Record<string, unknown>[] }[] }[] };
    leaky.bookings[0]!.quotes[0]!.lineItems[0]!.internalCostPaise = "100";
    expect(() => CustomerLeadSchema.parse(leaky)).toThrow();
    expect(() => CustomerLeadSchema.parse(dto)).not.toThrow();
  });
});

describe("talent serializer", () => {
  const db = buildSeed();

  it("shows the contracted payout but never selling prices or margin", () => {
    for (const booking of db.bookings.filter((b) => b.availability !== "NOT_CHECKED")) {
      const dto = toTalentBooking(db, booking);
      const keys = keysDeep(dto);
      for (const forbidden of ["sellingTotalPaise", "totalPaise", "subtotalPaise", "customerAmountPaise", "marginPaise", "internalCostPaise", "budgetMinPaise", "budgetMaxPaise"]) {
        expect(keys.has(forbidden), `${forbidden} leaked`).toBe(false);
      }
      if (booking.availability === "CONFIRMED") expect(dto.payoutPaise).toBe(booking.payoutTotalPaise);
    }
  });

  it("payout is below the customer's total", () => {
    const confirmed = db.bookings.find((b) => b.availability === "CONFIRMED")!;
    const dto = toTalentBooking(db, confirmed);
    expect(BigInt(dto.payoutPaise!)).toBeLessThan(BigInt(confirmed.sellingTotalPaise!));
  });
});
