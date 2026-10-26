import { beforeEach, describe, expect, it } from "vitest";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { calendarFor, runDemoAction, setCalendarDate, submitEnquiry } from "./server";
import { addTalentToLead, setCalendarSelfEdit, staffSetBlackout } from "./staff";
import type { MockDb } from "./types";

const staff = (role: string) => STAFF_USERS.find((s) => s.roles.includes(role as never))!;
const manager = staff("TALENT_MANAGER");
const sales = staff("SALES");
const CUSTOMER = "usr_demo_customer";
const DATE = "2031-05-17";

const enquiry = (talentSlugs: string[], eventDate = DATE) => ({
  eventType: "Wedding",
  eventDate,
  city: "Mumbai",
  budgetBand: "1l-3l",
  talentSlugs,
  contactName: "Test",
  phone: "9876500000",
});

let db: MockDb;
beforeEach(() => {
  db = buildSeed();
});

describe("mock calendar", () => {
  it("seeds onboarding dates as manager dates and holds confirmed bookings", () => {
    expect(calendarFor(db, "aanya-kapoor").entries).toContainEqual({ date: "2026-12-31", source: "manager", note: "Set at onboarding", ref: null, leadId: null });
    const confirmed = db.bookings.find((b) => b.availability === "CONFIRMED");
    if (confirmed) {
      const lead = db.leads.find((l) => l.id === confirmed.leadId)!;
      expect(calendarFor(db, confirmed.talentSlug).entries).toContainEqual({ date: lead.eventDate, source: "booking", note: `Booked · ${lead.ref}`, ref: lead.ref, leadId: lead.id });
    }
  });

  it("locks manager dates for the artist and respects the self-edit switch", () => {
    staffSetBlackout(db, manager, "aanya-kapoor", DATE, true, "Family wedding");
    expect(calendarFor(db, "aanya-kapoor").entries).toContainEqual({ date: DATE, source: "manager", note: "Family wedding", ref: null, leadId: null });
    expect(() => setCalendarDate(db, "aanya-kapoor", DATE, false, "artist")).toThrow(/manager/);
    expect(() => staffSetBlackout(db, sales, "aanya-kapoor", DATE, false)).toThrow(/role/);

    setCalendarSelfEdit(db, manager, "aanya-kapoor", false);
    expect(calendarFor(db, "aanya-kapoor").selfEdit).toBe(false);
    expect(() => setCalendarDate(db, "aanya-kapoor", "2031-06-01", true, "artist")).toThrow(/manager looks after/);
  });

  it("refuses enquiries and shortlist additions on blocked dates", () => {
    staffSetBlackout(db, manager, "kabir-malhotra", DATE, true);
    expect(() => submitEnquiry(db, CUSTOMER, enquiry(["kabir-malhotra", "dj-rhea"]))).toThrow(/^Kabir Malhotra isn't available on 17 May 2031/);
    const { id: leadId } = submitEnquiry(db, CUSTOMER, enquiry(["dj-rhea"]));
    expect(() => addTalentToLead(db, sales, leadId, "kabir-malhotra")).toThrow(/isn't available/);
  });

  it("frees a held date when the booking is cancelled", () => {
    const { id: leadId } = submitEnquiry(db, CUSTOMER, enquiry(["vikram-rao"]));
    const booking = db.bookings.find((b) => b.leadId === leadId)!;
    db.calendar["vikram-rao"] = [...(db.calendar["vikram-rao"] ?? []), { date: DATE, source: "booking", note: "Booked", bookingId: booking.id }];
    expect(() => staffSetBlackout(db, manager, "vikram-rao", DATE, false)).toThrow(/held by booking/);
    runDemoAction(db, booking.id, "cancelBooking", "Called off");
    expect(calendarFor(db, "vikram-rao").all).not.toContain(DATE);
  });
});
