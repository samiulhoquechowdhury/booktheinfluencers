import type { EnquiryInput } from "@repo/schemas";
import { toIstDateKey } from "@repo/utils";
import { DEMO_CUSTOMER_PHONE, TALENT_LOGINS } from "./internal";
import {
  acceptQuote,
  addDays,
  bookingsOf,
  contractOf,
  handleEsignWebhook,
  milestonesOf,
  newId,
  quotesOf,
  seedCalendar,
  runDemoAction,
  startCheckout,
  submitEnquiry,
  handleGatewayWebhook,
  postLeadMessage,
} from "./server";
import { DEFAULT_HERO_SLIDES } from "./site";
import { seedStaffAccounts } from "./staff-accounts";
import type { MockDb } from "./types";
import { TALENTS } from "./catalogue/data";

// Demo data built by running the real mock flows, so every seeded record obeys the same rules
// (including CONFIRMED, which only the confirmation rule can set).

const DEMO_CUSTOMER_ID = "usr_demo_customer";

function brief(overrides: Partial<EnquiryInput> & Pick<EnquiryInput, "eventType" | "eventDate" | "city" | "talentSlugs">): EnquiryInput {
  return {
    budgetBand: "1l-3l",
    contactName: "Neha Verma",
    phone: DEMO_CUSTOMER_PHONE,
    email: "neha.verma@example.com",
    ...overrides,
  };
}

function signAndPay(db: MockDb, bookingId: string, payBalance: boolean) {
  const contract = contractOf(db, bookingId);
  if (contract) handleEsignWebhook(db, { eventId: newId("evt"), contractId: contract.id, signedName: "Neha Verma" });
  for (const milestone of milestonesOf(db, bookingId)) {
    if (!milestone.isAdvance && !payBalance) continue;
    startCheckout(db, DEMO_CUSTOMER_ID, milestone.id);
    handleGatewayWebhook(db, {
      eventId: newId("evt"),
      milestoneId: milestone.id,
      gatewayPaymentId: `pay_demo${milestone.id.slice(-6)}`,
      amountPaise: milestone.amountPaise,
      method: "UPI",
      status: "captured",
    });
  }
}

/** Spreads a lead's activity timestamps over the days after it was created, oldest first. */
function backdate(db: MockDb, leadId: string, createdDaysAgo: number) {
  const created = addDays(new Date(), -createdDaysAgo);
  const lead = db.leads.find((l) => l.id === leadId)!;
  lead.createdAt = created.toISOString();
  const items = db.activities.filter((a) => a.leadId === leadId);
  const step = (createdDaysAgo * 24 * 60 * 60 * 1000) / Math.max(items.length, 1) / 1.5;
  items.forEach((item, index) => {
    item.at = new Date(created.getTime() + index * step).toISOString();
  });
}

export function buildSeed(): MockDb {
  const now = new Date();
  const db: MockDb = {
    version: 1,
    seq: 100,
    users: [
      {
        id: DEMO_CUSTOMER_ID,
        phone: DEMO_CUSTOMER_PHONE,
        name: "Neha Verma",
        email: "neha.verma@example.com",
        roles: ["CUSTOMER"],
        talentSlug: null,
        createdAt: addDays(now, -60).toISOString(),
      },
      ...Object.entries(TALENT_LOGINS).map(([phone, slug]) => ({
        id: `usr_talent_${slug}`,
        phone,
        name: TALENTS.find((t) => t.slug === slug)?.stageName ?? slug,
        email: null,
        roles: ["TALENT" as const],
        talentSlug: slug,
        createdAt: addDays(now, -120).toISOString(),
      })),
    ],
    leads: [],
    bookings: [],
    quotes: [],
    contracts: [],
    milestones: [],
    payments: [],
    payouts: [],
    activities: [],
    favourites: { [DEMO_CUSTOMER_ID]: ["aanya-kapoor", "dj-rhea"] },
    calendar: seedCalendar(),
    calendarSelfEdit: {},
    staffAccounts: seedStaffAccounts(),
    heroSlides: structuredClone(DEFAULT_HERO_SLIDES),
    media: {},
    processedWebhooks: [],
    messages: [],
    contactRequests: [],
    talentApplications: [],
    newsletter: [],
    notificationsSeenAt: {},
    audit: [],
    talentRecords: {},
  };

  // 1. Corporate show — fully confirmed, balance still due.
  const corporate = submitEnquiry(
    db,
    DEMO_CUSTOMER_ID,
    brief({
      eventType: "Corporate event",
      eventDate: toIstDateKey(addDays(now, 53)),
      city: "Bengaluru",
      venue: "Hotel ballroom, Whitefield",
      audienceSize: 400,
      durationMins: 60,
      talentSlugs: ["kabir-malhotra"],
      language: "English",
      notes: "Annual day. Clean set please — families attend.",
      companyName: "Northwind Analytics",
    }),
  );
  const [kabir] = bookingsOf(db, corporate.id);
  for (const action of ["startAvailabilityCheck", "markAvailable", "recordRepAcceptance", "sendQuote"] as const) {
    runDemoAction(db, kabir!.id, action);
  }
  acceptQuote(db, DEMO_CUSTOMER_ID, quotesOf(db, kabir!.id)[0]!.id);
  runDemoAction(db, kabir!.id, "sendContract");
  signAndPay(db, kabir!.id, false);
  backdate(db, corporate.id, 12);
  postLeadMessage(db, corporate.id, "customer", "Neha Verma", "Hi Riya, can Kabir keep the set clean? Families will be in the audience.");
  postLeadMessage(db, corporate.id, "staff", "Riya Sharma", "Absolutely — I've passed that on and his team confirmed a clean 60-minute set.");
  const [first, second] = db.messages.filter((m) => m.thread.kind === "lead" && m.thread.leadId === corporate.id);
  first!.at = addDays(now, -6).toISOString();
  second!.at = addDays(now, -5.8).toISOString();

  // 2. Sangeet — one quote ready to accept, one artist still being checked.
  const sangeet = submitEnquiry(
    db,
    DEMO_CUSTOMER_ID,
    brief({
      eventType: "Sangeet",
      eventDate: toIstDateKey(addDays(now, 90)),
      city: "Jaipur",
      venue: "Heritage hotel lawns",
      audienceSize: 250,
      durationMins: 120,
      budgetBand: "5l-15l",
      talentSlugs: ["aanya-kapoor", "aria-mehta"],
      language: "Hindi",
      notes: "Bride's side sangeet. Would love a Punjabi medley for the family dance.",
    }),
  );
  const [aanya, aria] = bookingsOf(db, sangeet.id);
  for (const action of ["startAvailabilityCheck", "markAvailable", "recordRepAcceptance", "sendQuote"] as const) {
    runDemoAction(db, aanya!.id, action);
  }
  runDemoAction(db, aria!.id, "startAvailabilityCheck");
  backdate(db, sangeet.id, 4);

  // 3. Past private party — completed, paid and settled.
  const party = submitEnquiry(
    db,
    DEMO_CUSTOMER_ID,
    brief({
      eventType: "Private party",
      eventDate: toIstDateKey(addDays(now, -40)),
      city: "Mumbai",
      venue: "Rooftop, Bandra",
      audienceSize: 80,
      durationMins: 90,
      budgetBand: "5l-15l",
      talentSlugs: ["aanya-kapoor"],
    }),
  );
  const [pastShow] = bookingsOf(db, party.id);
  for (const action of ["startAvailabilityCheck", "markAvailable", "recordRepAcceptance", "sendQuote"] as const) {
    runDemoAction(db, pastShow!.id, action);
  }
  acceptQuote(db, DEMO_CUSTOMER_ID, quotesOf(db, pastShow!.id)[0]!.id);
  runDemoAction(db, pastShow!.id, "sendContract");
  signAndPay(db, pastShow!.id, true);
  runDemoAction(db, pastShow!.id, "completeEvent", "Two sets, ran on time. Client very happy.");
  runDemoAction(db, pastShow!.id, "markPayoutPaid");
  backdate(db, party.id, 75);

  return db;
}
