import { beforeEach, describe, expect, it } from "vitest";
import { toIstDateKey } from "@repo/utils";
import {
  ApiError,
  acceptQuote,
  addDays,
  contractOf,
  handleEsignWebhook,
  handleGatewayWebhook,
  leadMessages,
  milestonesOf,
  postLeadMessage,
  quotesOf,
  runDemoAction,
  submitContactRequest,
  submitEnquiry,
  submitTalentApplication,
  subscribeNewsletter,
  transitionLead,
} from "./server";
import type { BookingRec, MockDb } from "./types";

const CUSTOMER = "usr_test";

function emptyDb(): MockDb {
  return {
    version: 1,
    seq: 0,
    users: [{ id: CUSTOMER, phone: "9123456780", name: "Test", email: null, roles: ["CUSTOMER"], talentSlug: null, createdAt: new Date().toISOString() }],
    leads: [],
    bookings: [],
    quotes: [],
    contracts: [],
    milestones: [],
    payments: [],
    payouts: [],
    activities: [],
    favourites: {},
    calendar: {},
    calendarSelfEdit: {},
    staffAccounts: [],
    heroSlides: [],
    media: {},
    assistant: null,
    loginEvents: [],
    followUps: [],
    reconciliationRuns: [],
    onboarding: {},
    processedWebhooks: [],
    messages: [],
    contactRequests: [],
    talentApplications: [],
    newsletter: [],
    notificationsSeenAt: {},
    audit: [],
    talentRecords: {},
  };
}

let db: MockDb;
let booking: BookingRec;

function payAdvance(eventId = "evt_advance") {
  const advance = milestonesOf(db, booking.id).find((m) => m.isAdvance)!;
  handleGatewayWebhook(db, {
    eventId,
    milestoneId: advance.id,
    gatewayPaymentId: `pay_${eventId}`,
    amountPaise: advance.amountPaise,
    method: "UPI",
    status: "captured",
  });
  return advance;
}

beforeEach(() => {
  db = emptyDb();
  const lead = submitEnquiry(db, CUSTOMER, {
    eventType: "Corporate event",
    eventDate: toIstDateKey(addDays(new Date(), 60)),
    city: "Mumbai",
    budgetBand: "1l-3l",
    talentSlugs: ["kabir-malhotra"],
    contactName: "Test",
    phone: "9123456780",
  });
  booking = db.bookings.find((b) => b.leadId === lead.id)!;
});

describe("booking flow", () => {
  it("creates a NEW lead with one draft booking per artist and a reference", () => {
    expect(db.leads[0]).toMatchObject({ stage: "NEW", ref: expect.stringMatching(/^TB-\d{4}-\d{6}$/) });
    expect(booking.availability).toBe("NOT_CHECKED");
  });

  it("confirms only once all four conditions are met — in any order", () => {
    runDemoAction(db, booking.id, "startAvailabilityCheck");
    runDemoAction(db, booking.id, "markAvailable");
    runDemoAction(db, booking.id, "sendQuote");
    acceptQuote(db, CUSTOMER, quotesOf(db, booking.id)[0]!.id);
    expect(booking.availability).toBe("AVAILABLE");

    runDemoAction(db, booking.id, "sendContract");
    handleEsignWebhook(db, { eventId: "evt_sign", contractId: contractOf(db, booking.id)!.id, signedName: "Test" });
    payAdvance();
    // Quote accepted, signed, paid — but the rep hasn't accepted yet.
    expect(booking.availability).toBe("AVAILABLE");
    expect(db.leads[0]!.stage).toBe("ADVANCE_PENDING");

    runDemoAction(db, booking.id, "recordRepAcceptance");
    expect(booking.availability).toBe("CONFIRMED");
    expect(db.leads[0]!.stage).toBe("CONFIRMED");
    expect(booking.sellingTotalPaise).toBe(quotesOf(db, booking.id)[0]!.totalPaise);
    expect(BigInt(booking.marginPaise!)).toBeGreaterThan(0n);
  });

  it("never lets staff move a lead to CONFIRMED", () => {
    runDemoAction(db, booking.id, "startAvailabilityCheck");
    runDemoAction(db, booking.id, "markAvailable");
    runDemoAction(db, booking.id, "sendQuote");
    acceptQuote(db, CUSTOMER, quotesOf(db, booking.id)[0]!.id);
    expect(() => transitionLead(db, db.leads[0]!, "CONFIRMED")).toThrow(ApiError);
  });

  it("ignores duplicate and mismatched gateway webhooks", () => {
    runDemoAction(db, booking.id, "startAvailabilityCheck");
    runDemoAction(db, booking.id, "markAvailable");
    runDemoAction(db, booking.id, "sendQuote");
    acceptQuote(db, CUSTOMER, quotesOf(db, booking.id)[0]!.id);

    const advance = milestonesOf(db, booking.id).find((m) => m.isAdvance)!;
    handleGatewayWebhook(db, { eventId: "evt_short", milestoneId: advance.id, gatewayPaymentId: "pay_x", amountPaise: "1", method: "UPI", status: "captured" });
    expect(advance.status).not.toBe("PAID");

    payAdvance("evt_dupe");
    payAdvance("evt_dupe");
    payAdvance("evt_other");
    expect(db.payments).toHaveLength(1);
    expect(advance.status).toBe("PAID");
  });

  it("rejects an expired quote", () => {
    runDemoAction(db, booking.id, "startAvailabilityCheck");
    runDemoAction(db, booking.id, "markAvailable");
    runDemoAction(db, booking.id, "sendQuote");
    const quote = quotesOf(db, booking.id)[0]!;
    quote.validUntil = addDays(new Date(), -1).toISOString();
    expect(() => acceptQuote(db, CUSTOMER, quote.id)).toThrow(/expired/);
    expect(quote.status).toBe("EXPIRED");
  });

  it("refuses to quote before availability is confirmed", () => {
    expect(() => runDemoAction(db, booking.id, "sendQuote")).toThrow(ApiError);
  });

  it("does not let another customer accept the quote", () => {
    runDemoAction(db, booking.id, "startAvailabilityCheck");
    runDemoAction(db, booking.id, "markAvailable");
    runDemoAction(db, booking.id, "sendQuote");
    expect(() => acceptQuote(db, "usr_someone_else", quotesOf(db, booking.id)[0]!.id)).toThrow(/not found/);
  });

  it("checks a second artist without rewinding a lead that already has a quote", () => {
    const lead = submitEnquiry(db, CUSTOMER, {
      eventType: "Wedding",
      eventDate: toIstDateKey(addDays(new Date(), 90)),
      city: "Jaipur",
      budgetBand: "5l-15l",
      talentSlugs: ["aanya-kapoor", "aria-mehta"],
      contactName: "Test",
      phone: "9123456780",
    });
    const [first, second] = db.bookings.filter((b) => b.leadId === lead.id);
    runDemoAction(db, first!.id, "startAvailabilityCheck");
    runDemoAction(db, first!.id, "markAvailable");
    runDemoAction(db, first!.id, "sendQuote");
    runDemoAction(db, second!.id, "startAvailabilityCheck");
    expect(lead.stage).toBe("QUOTE_SENT");
    expect(second!.availability).toBe("AWAITING_MANAGER");
  });

  it("supersedes the old quote when a revision is sent", () => {
    runDemoAction(db, booking.id, "startAvailabilityCheck");
    runDemoAction(db, booking.id, "markAvailable");
    runDemoAction(db, booking.id, "sendQuote");
    runDemoAction(db, booking.id, "sendQuote");
    const [latest, previous] = quotesOf(db, booking.id);
    expect(latest).toMatchObject({ version: 2, status: "SENT" });
    expect(previous).toMatchObject({ version: 1, status: "SUPERSEDED" });
  });
});

describe("messages, contact, applications and newsletter", () => {
  it("keeps a thread per brief and records the manager on first staff reply", () => {
    const lead = db.leads[0]!;
    postLeadMessage(db, lead.id, "customer", "Test", "  Hello there  ");
    postLeadMessage(db, lead.id, "staff", "Riya Sharma", "Hi! Happy to help.");
    const thread = leadMessages(db, lead.id);
    expect(thread.map((m) => [m.author, m.body])).toEqual([
      ["customer", "Hello there"],
      ["staff", "Hi! Happy to help."],
    ]);
    expect(lead.ownerName).toBe("Riya Sharma");
  });

  it("rejects empty messages", () => {
    expect(() => postLeadMessage(db, db.leads[0]!.id, "customer", "Test", "   ")).toThrow(ApiError);
  });

  it("files contact requests with a reference", () => {
    const request = submitContactRequest(db, { name: "Asha", phone: "9876501234", email: "", topic: "Partnerships", message: "We run a venue in Pune." });
    expect(request.ref).toMatch(/^CR-\d{6}$/);
    expect(() => submitContactRequest(db, { name: "Asha", phone: "123", email: "", topic: "x", message: "Long enough message" })).toThrow(/mobile/);
  });

  it("files artist applications once per phone", () => {
    const input = {
      stageName: "The Night Owls",
      category: "Singers",
      city: "Pune",
      phone: "9876509876",
      email: "owls@example.com",
      representation: "I manage my own bookings",
      links: "https://youtube.com/@owls",
      about: "Five-piece band playing retro Bollywood.",
    };
    expect(submitTalentApplication(db, input).ref).toMatch(/^AP-\d{6}$/);
    expect(() => submitTalentApplication(db, input)).toThrow(/already have your application/);
  });

  it("subscribes each email once, case-insensitively", () => {
    expect(subscribeNewsletter(db, "Neha@Example.com")).toEqual({ alreadySubscribed: false });
    expect(subscribeNewsletter(db, "neha@example.com ")).toEqual({ alreadySubscribed: true });
    expect(() => subscribeNewsletter(db, "not-an-email")).toThrow(ApiError);
  });
});
