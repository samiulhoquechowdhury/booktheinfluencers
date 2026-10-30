import { beforeEach, describe, expect, it } from "vitest";
import { buildSeed } from "./seed";
import { assertDateOpen, closeRivals, startCheckout, submitEnquiry } from "./server";
import type { MockDb } from "./types";

const date = "2030-11-03";
const brief = { eventType: "Wedding", eventDate: date, altDate: "", city: "Mumbai", venue: "", budgetBand: "1l-3l", talentSlugs: ["arjun-sethi"], language: "", notes: "", contactName: "Test", phone: "9876500000", email: "", companyName: "", gstin: "" };

let db: MockDb;
beforeEach(() => {
  db = buildSeed();
});

describe("mock double booking", () => {
  it("closes other open requests for a date, and names it as booked", () => {
    const [a, b] = [db.users[0]!, db.users[1]!];
    const first = submitEnquiry(db, a.id, brief as never);
    const second = submitEnquiry(db, b.id, brief as never);
    const winner = db.bookings.find((x) => x.leadId === first.id)!;
    const loser = db.bookings.find((x) => x.leadId === second.id)!;
    db.calendar["arjun-sethi"] = [{ date, source: "booking", note: "Booked", bookingId: winner.id }];
    closeRivals(db, winner, date);
    expect(loser.availability).toBe("UNAVAILABLE");
    expect(winner.availability).not.toBe("UNAVAILABLE");
    expect(() => assertDateOpen(db, ["arjun-sethi"], date)).toThrow(/already booked/);
    db.milestones.push({ id: "m1", bookingId: loser.id, isAdvance: true, status: "PENDING" } as never);
    expect(() => startCheckout(db, b.id, "m1")).toThrow(/no longer available/);
  });
});
