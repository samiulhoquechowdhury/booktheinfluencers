import { beforeEach, describe, expect, it } from "vitest";
import { toIstDateKey } from "@repo/utils";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { addDays, contractOf, handleEsignWebhook, milestonesOf, quotesOf, submitEnquiry } from "./server";
import {
  analytics,
  approveQuote,
  assignOwner,
  bookingAction,
  createQuote,
  draftQuote,
  moveStage,
  quoteChecks,
  recordManualPayment,
} from "./staff";
import { acceptQuote } from "./server";
import type { BookingRec, MockDb } from "./types";

const staff = (role: string) => STAFF_USERS.find((s) => s.roles.includes(role as never))!;
const admin = staff("SUPER_ADMIN");
const sales = staff("SALES");
const talentManager = staff("TALENT_MANAGER");
const accounts = staff("ACCOUNTS");
const ops = staff("OPS");
const CUSTOMER = "usr_demo_customer";

let db: MockDb;
let booking: BookingRec;

beforeEach(() => {
  db = buildSeed();
  const lead = submitEnquiry(db, CUSTOMER, {
    eventType: "Conference",
    eventDate: toIstDateKey(addDays(new Date(), 45)),
    city: "Hyderabad",
    budgetBand: "1l-3l",
    talentSlugs: ["vikram-rao"],
    contactName: "Neha Verma",
    phone: "9876543210",
  });
  booking = db.bookings.find((b) => b.leadId === lead.id)!;
  db.audit = [];
});

describe("staff permissions", () => {
  it("lets only the right roles act", () => {
    expect(() => assignOwner(db, ops, booking.leadId, "Riya Sharma")).toThrow(/role/);
    expect(() => bookingAction(db, sales, booking.id, "markPayoutPaid")).toThrow(/role/);
    bookingAction(db, talentManager, booking.id, "startAvailabilityCheck");
    expect(booking.availability).toBe("AWAITING_MANAGER");
  });

  it("lets super admins do anything", () => {
    assignOwner(db, admin, booking.leadId, "Riya Sharma");
    expect(db.leads.find((l) => l.id === booking.leadId)!.ownerName).toBe("Riya Sharma");
  });

  it("writes an audit entry for every mutation", () => {
    assignOwner(db, sales, booking.leadId, "Riya Sharma");
    bookingAction(db, sales, booking.id, "startAvailabilityCheck");
    expect(db.audit.map((a) => a.action)).toEqual(["lead.assign", "booking.startAvailabilityCheck"]);
    expect(db.audit[0]).toMatchObject({ actorId: sales.id, entity: "Lead" });
  });

  it("refuses manual stage moves to CONFIRMED", () => {
    bookingAction(db, sales, booking.id, "startAvailabilityCheck");
    expect(() => moveStage(db, admin, booking.leadId, "CONFIRMED")).toThrow();
  });
});

describe("quote builder", () => {
  beforeEach(() => {
    bookingAction(db, sales, booking.id, "startAvailabilityCheck");
    bookingAction(db, talentManager, booking.id, "markAvailable");
  });

  it("sends a rate-card quote straight to the customer", () => {
    const quote = createQuote(db, sales, booking.id, draftQuote(db, booking.id));
    expect(quote.status).toBe("SENT");
    expect(db.leads.find((l) => l.id === booking.leadId)!.stage).toBe("QUOTE_SENT");
  });

  it("holds a discounted quote for super admin approval", () => {
    const draft = draftQuote(db, booking.id);
    const fee = draft.lines.find((l) => l.type === "TALENT_FEE")!;
    fee.customerAmountPaise = String(BigInt(fee.customerAmountPaise) / 2n);
    expect(quoteChecks("vikram-rao", draft.lines).needsApproval).toBe(true);

    const quote = createQuote(db, sales, booking.id, draft);
    expect(quote.status).toBe("PENDING_APPROVAL");
    expect(db.leads.find((l) => l.id === booking.leadId)!.stage).toBe("AVAILABILITY_CHECK");
    expect(() => approveQuote(db, sales, quote.id)).toThrow(/role/);

    approveQuote(db, admin, quote.id);
    expect(quote.status).toBe("SENT");
    expect(db.leads.find((l) => l.id === booking.leadId)!.stage).toBe("QUOTE_SENT");
  });

  it("validates the draft", () => {
    const draft = draftQuote(db, booking.id);
    expect(() => createQuote(db, sales, booking.id, { ...draft, lines: draft.lines.filter((l) => l.type !== "TALENT_FEE") })).toThrow(/artist fee/);
    expect(() => createQuote(db, sales, booking.id, { ...draft, advanceBps: 500 })).toThrow(/Advance/);
  });
});

describe("manual payment", () => {
  it("records a bank transfer and confirms when everything else is done", () => {
    bookingAction(db, sales, booking.id, "startAvailabilityCheck");
    bookingAction(db, talentManager, booking.id, "markAvailable");
    bookingAction(db, talentManager, booking.id, "recordRepAcceptance");
    createQuote(db, sales, booking.id, draftQuote(db, booking.id));
    acceptQuote(db, CUSTOMER, quotesOf(db, booking.id)[0]!.id);
    bookingAction(db, sales, booking.id, "sendContract");
    handleEsignWebhook(db, { eventId: "evt_s", contractId: contractOf(db, booking.id)!.id, signedName: "Neha" });

    const advance = milestonesOf(db, booking.id).find((m) => m.isAdvance)!;
    expect(() => recordManualPayment(db, sales, advance.id, "UTR12345")).toThrow(/role/);
    recordManualPayment(db, accounts, advance.id, "UTR12345");
    expect(advance.status).toBe("PAID");
    expect(booking.availability).toBe("CONFIRMED");
  });
});

describe("analytics", () => {
  it("shows finance figures to accounts only", () => {
    expect(analytics(db, accounts).finance).not.toBeNull();
    expect(analytics(db, sales).finance).toBeNull();
    expect(analytics(db, sales).confirmedBookings).toBeGreaterThan(0);
  });
});
