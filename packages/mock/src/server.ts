import type { CalendarEntry, EnquiryInput, TalentCalendar } from "@repo/schemas";
import {
  canTransition,
  computeQuoteTotals,
  isConfirmable,
  splitIntoMilestones,
  toIstDateKey,
  type LeadStage,
} from "@repo/utils";
import { BLACKOUT_SEED } from "./catalogue/blackouts";
import { BUDGET_BANDS, TALENTS } from "./catalogue/data";
import { ACCOUNT_MANAGER, internalFor } from "./internal";
import type { BookingRec, LeadRec, MilestoneRec, MockDb, QuoteLineRec, QuoteRec } from "./types";

// Business rules of the mock backend. Pure functions over a MockDb draft — callers persist.
// Mirrors what apps/api will do; the UI never changes stages or money state directly.

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const DAY = 24 * 60 * 60 * 1000;

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
export const nowIso = () => new Date().toISOString();
export const addDays = (from: Date, days: number) => new Date(from.getTime() + days * DAY);

export function nextRef(db: MockDb, at = new Date()) {
  db.seq += 1;
  return `TB-${at.getFullYear()}-${String(db.seq).padStart(6, "0")}`;
}

export function activity(db: MockDb, leadId: string, title: string, body: string | null = null, internal = false) {
  db.activities.push({ id: newId("act"), leadId, at: nowIso(), title, body, internal });
}

function talentName(slug: string) {
  return TALENTS.find((t) => t.slug === slug)?.stageName ?? slug;
}

export const leadOf = (db: MockDb, leadId: string) => db.leads.find((l) => l.id === leadId);
export const bookingsOf = (db: MockDb, leadId: string) => db.bookings.filter((b) => b.leadId === leadId);
export const quotesOf = (db: MockDb, bookingId: string) =>
  db.quotes.filter((q) => q.bookingId === bookingId).toSorted((a, b) => b.version - a.version);
export const contractOf = (db: MockDb, bookingId: string) => db.contracts.find((c) => c.bookingId === bookingId);
export const milestonesOf = (db: MockDb, bookingId: string) => db.milestones.filter((m) => m.bookingId === bookingId);

function must<T>(value: T | undefined, what: string): T {
  if (!value) throw new ApiError("NOT_FOUND", `${what} not found`);
  return value;
}

// ---------- State machine ----------

export function transitionLead(
  db: MockDb,
  lead: LeadRec,
  to: LeadStage,
  opts: { actor?: "staff" | "system"; reason?: string; completionNote?: string } = {},
) {
  const bookings = bookingsOf(db, lead.id);
  const quotes = bookings.flatMap((b) => quotesOf(db, b.id));
  const milestones = bookings.flatMap((b) => milestonesOf(db, b.id));
  const result = canTransition(lead.stage, to, {
    actor: opts.actor ?? "staff",
    ownerSet: Boolean(lead.ownerName),
    bookingCount: bookings.length,
    anyAvailable: bookings.some((b) => b.availability === "AVAILABLE" || b.availability === "TENTATIVE"),
    hasSentQuote: quotes.some((q) => q.status === "SENT"),
    hasAcceptedQuote: quotes.some((q) => q.status === "ACCEPTED"),
    reason: opts.reason,
    completionNote: opts.completionNote,
    payoutPaid: bookings.every((b) => db.payouts.find((p) => p.bookingId === b.id)?.status === "PAID"),
    allMilestonesPaid: milestones.length > 0 && milestones.every((m) => m.status === "PAID"),
  });
  if (!result.ok) throw new ApiError("INVALID_TRANSITION", result.reason);
  activity(db, lead.id, `Stage: ${lead.stage} → ${to}`, opts.reason ?? opts.completionNote ?? null, true);
  lead.stage = to;
  if (to === "LOST" || to === "CANCELLED") for (const b of bookings) releaseDate(db, b.id);
}

/**
 * Walks forward through intermediate stages, each through the state machine.
 * A lead already past the path (e.g. another artist on it was quoted) stays where it is.
 */
function walkLead(db: MockDb, lead: LeadRec, path: LeadStage[]) {
  const start = path.indexOf(lead.stage);
  if (start === -1) return;
  for (const stage of path.slice(start + 1)) transitionLead(db, lead, stage);
}

/** OPS-1: evaluated after quote acceptance, contract signature, advance payment and rep acceptance. */
export function evaluateConfirmation(db: MockDb, booking: BookingRec) {
  if (booking.availability === "CONFIRMED" || booking.cancelledAt) return;
  const quote = quotesOf(db, booking.id).find((q) => q.status === "ACCEPTED");
  const facts = {
    quoteAccepted: Boolean(quote),
    contractSigned: contractOf(db, booking.id)?.status === "SIGNED",
    advancePaid: milestonesOf(db, booking.id).some((m) => m.isAdvance && m.status === "PAID"),
    repAccepted: Boolean(booking.repAcceptedAt),
  };
  if (!isConfirmable(facts) || !quote) return;

  const payout = quote.lineItems.find((line) => line.type === "TALENT_FEE")?.internalCostPaise ?? "0";
  booking.availability = "CONFIRMED";
  booking.confirmedAt = nowIso();
  booking.sellingTotalPaise = quote.totalPaise;
  booking.payoutTotalPaise = payout;
  booking.marginPaise = String(BigInt(quote.subtotalPaise) - BigInt(quote.internalCostPaise));

  const lead = must(leadOf(db, booking.leadId), "Lead");
  holdDate(db, booking, lead);
  if (lead.stage === "ADVANCE_PENDING") transitionLead(db, lead, "CONFIRMED", { actor: "system" });
  activity(db, lead.id, `${talentName(booking.talentSlug)} is confirmed`, "Contract signed, advance received and the artist's team has accepted.");
}

// ---------- Quotes ----------

export function buildQuote(db: MockDb, booking: BookingRec, createdAt = new Date()): QuoteRec {
  const lead = must(leadOf(db, booking.leadId), "Lead");
  const talent = must(TALENTS.find((t) => t.slug === booking.talentSlug), "Talent");
  const internal = internalFor(talent.slug);
  const fee = internal.sellingRatePaise;

  const lines: QuoteLineRec[] = [
    {
      type: "TALENT_FEE",
      description: `${talent.stageName} — performance fee`,
      customerAmountPaise: String(fee),
      internalCostPaise: String((fee * BigInt(internal.payoutBps)) / 10_000n),
      taxRateBps: 1800,
    },
  ];
  if (lead.city !== talent.baseCity) {
    lines.push(
      { type: "TRAVEL", description: `Return travel from ${talent.baseCity}`, customerAmountPaise: "3500000", internalCostPaise: "3200000", taxRateBps: 1800 },
      { type: "ACCOMMODATION", description: "Hotel stay (1 night)", customerAmountPaise: "1800000", internalCostPaise: "1600000", taxRateBps: 1800 },
    );
  }
  lines.push({
    type: "SERVICE_FEE",
    description: "Booking & coordination fee",
    customerAmountPaise: String((fee * 750n) / 10_000n),
    internalCostPaise: "0",
    taxRateBps: 1800,
  });

  const totals = computeQuoteTotals(lines.map((l) => ({ customerAmountPaise: BigInt(l.customerAmountPaise), taxRateBps: l.taxRateBps })));
  const previous = quotesOf(db, booking.id);
  return {
    id: newId("quo"),
    bookingId: booking.id,
    version: (previous[0]?.version ?? 0) + 1,
    status: "SENT",
    validUntil: addDays(createdAt, 7).toISOString(),
    subtotalPaise: String(totals.subtotalPaise),
    taxPaise: String(totals.taxPaise),
    totalPaise: String(totals.totalPaise),
    internalCostPaise: String(lines.reduce((sum, l) => sum + BigInt(l.internalCostPaise), 0n)),
    acceptedAt: null,
    acceptedByUserId: null,
    acceptedIp: null,
    changeRequest: null,
    lineItems: lines,
    milestonePlan: [
      { label: "Advance", percentBps: 5000 },
      { label: "Balance", percentBps: 5000 },
    ],
    createdAt: createdAt.toISOString(),
  };
}

export function milestonesFor(quote: QuoteRec, lead: LeadRec, from = new Date()): MilestoneRec[] {
  const eventDay = new Date(`${lead.eventDate}T00:00:00+05:30`);
  const advanceDue = new Date(Math.min(addDays(from, 3).getTime(), eventDay.getTime()));
  const balanceDue = new Date(Math.max(addDays(eventDay, -7).getTime(), advanceDue.getTime()));
  return splitIntoMilestones(BigInt(quote.totalPaise), quote.milestonePlan).map((part, index) => ({
    id: newId("mil"),
    bookingId: quote.bookingId,
    label: part.label,
    amountPaise: String(part.amountPaise),
    dueDate: (index === 0 ? advanceDue : balanceDue).toISOString(),
    status: "PENDING",
    isAdvance: index === 0,
    paidAt: null,
  }));
}

// ---------- Customer actions ----------

export function submitEnquiry(db: MockDb, customerId: string, input: EnquiryInput) {
  assertDateOpen(db, input.talentSlugs, input.eventDate);
  const band = BUDGET_BANDS.find((b) => b.id === input.budgetBand);
  const lead: LeadRec = {
    id: newId("lead"),
    ref: nextRef(db),
    stage: "NEW",
    ownerName: null,
    customerId,
    eventType: input.eventType,
    eventDate: input.eventDate,
    altDate: input.altDate || null,
    city: input.city,
    venue: input.venue || null,
    audienceSize: input.audienceSize ?? null,
    durationMins: input.durationMins ?? null,
    budgetMinPaise: band && "minPaise" in band ? band.minPaise : null,
    budgetMaxPaise: band && "maxPaise" in band ? band.maxPaise : null,
    language: input.language || null,
    notes: input.notes || null,
    companyName: input.companyName || null,
    gstin: input.gstin || null,
    contactName: input.contactName,
    contactEmail: input.email || null,
    lostReason: null,
    createdAt: nowIso(),
  };
  db.leads.push(lead);
  // ENQ-2: one draft booking per selected talent.
  for (const slug of input.talentSlugs) {
    db.bookings.push({
      id: newId("bkg"),
      leadId: lead.id,
      talentSlug: slug,
      availability: "NOT_CHECKED",
      repAcceptedAt: null,
      confirmedAt: null,
      completedAt: null,
      completionNote: null,
      cancelledAt: null,
      cancelReason: null,
      sellingTotalPaise: null,
      payoutTotalPaise: null,
      marginPaise: null,
    });
  }
  activity(
    db,
    lead.id,
    "Enquiry received",
    `Reference ${lead.ref}. Our team will call you to go through the brief.`,
  );
  return lead;
}

function ownBooking(db: MockDb, userId: string, bookingId: string) {
  const booking = must(db.bookings.find((b) => b.id === bookingId), "Booking");
  const lead = must(leadOf(db, booking.leadId), "Booking");
  if (lead.customerId !== userId) throw new ApiError("NOT_FOUND", "Booking not found");
  return { booking, lead };
}

function ownQuote(db: MockDb, userId: string, quoteId: string) {
  const quote = must(db.quotes.find((q) => q.id === quoteId), "Quote");
  return { quote, ...ownBooking(db, userId, quote.bookingId) };
}

/** QUO-4 / QUO-7 */
export function acceptQuote(db: MockDb, userId: string, quoteId: string) {
  const { quote, booking, lead } = ownQuote(db, userId, quoteId);
  if (quote.status !== "SENT") throw new ApiError("QUOTE_NOT_OPEN", "This quote can no longer be accepted");
  if (new Date(quote.validUntil).getTime() < Date.now()) {
    quote.status = "EXPIRED";
    throw new ApiError("QUOTE_EXPIRED", "This quote has expired — ask your manager for a fresh one");
  }
  quote.status = "ACCEPTED";
  quote.acceptedAt = nowIso();
  quote.acceptedByUserId = userId;
  quote.acceptedIp = "browser (demo)";
  db.milestones.push(...milestonesFor(quote, lead));
  if (lead.stage === "QUOTE_SENT" || lead.stage === "NEGOTIATION") transitionLead(db, lead, "ADVANCE_PENDING");
  activity(db, lead.id, `Quote v${quote.version} accepted`, `${talentName(booking.talentSlug)}. Next: sign the contract and pay the advance.`);
  evaluateConfirmation(db, booking);
}

export function requestQuoteChanges(db: MockDb, userId: string, quoteId: string, note: string) {
  const { quote, lead } = ownQuote(db, userId, quoteId);
  if (quote.status !== "SENT") throw new ApiError("QUOTE_NOT_OPEN", "This quote is no longer open");
  if (!note.trim()) throw new ApiError("VALIDATION", "Tell us what you'd like changed");
  quote.changeRequest = note.trim();
  if (lead.stage === "QUOTE_SENT") transitionLead(db, lead, "NEGOTIATION");
  activity(db, lead.id, `Changes requested on quote v${quote.version}`, note.trim());
}

export function startCheckout(db: MockDb, userId: string, milestoneId: string) {
  const milestone = must(db.milestones.find((m) => m.id === milestoneId), "Payment");
  ownBooking(db, userId, milestone.bookingId);
  if (milestone.status === "PAID") throw new ApiError("ALREADY_PAID", "This payment is already complete");
  const contract = contractOf(db, milestone.bookingId);
  if (!milestone.isAdvance && contract?.status !== "SIGNED") {
    throw new ApiError("CONTRACT_PENDING", "Sign the contract before paying the balance");
  }
  if (milestone.status === "PENDING") milestone.status = "LINK_SENT";
  return milestone;
}

export function requestCancellation(db: MockDb, userId: string, bookingId: string, reason: string) {
  const { booking, lead } = ownBooking(db, userId, bookingId);
  if (!reason.trim()) throw new ApiError("VALIDATION", "Tell us why you'd like to cancel");
  activity(
    db,
    lead.id,
    `Cancellation requested for ${talentName(booking.talentSlug)}`,
    `${reason.trim()} — your manager will confirm any charges under the cancellation policy.`,
  );
}

// ---------- Provider webhooks (simulated) ----------

/** PAY-3: only a verified, de-duplicated gateway event marks money as received. */
export function handleGatewayWebhook(
  db: MockDb,
  event: { eventId: string; milestoneId: string; gatewayPaymentId: string; amountPaise: string; method: string; status: "captured" | "failed" },
) {
  if (db.processedWebhooks.includes(event.eventId)) return;
  db.processedWebhooks.push(event.eventId);

  const milestone = db.milestones.find((m) => m.id === event.milestoneId);
  if (!milestone || milestone.status === "PAID") return;
  if (event.status === "failed") return;
  if (event.amountPaise !== milestone.amountPaise) return; // amount mismatch: left for Accounts to reconcile

  db.payments.push({
    id: newId("pay"),
    milestoneId: milestone.id,
    method: event.method,
    gatewayPaymentId: event.gatewayPaymentId,
    amountPaise: event.amountPaise,
    status: "captured",
    receivedAt: nowIso(),
  });
  milestone.status = "PAID";
  milestone.paidAt = nowIso();

  const booking = must(db.bookings.find((b) => b.id === milestone.bookingId), "Booking");
  activity(db, booking.leadId, `${milestone.label} payment received`, `Payment ref ${event.gatewayPaymentId}.`);
  evaluateConfirmation(db, booking);
}

export function handleEsignWebhook(db: MockDb, event: { eventId: string; contractId: string; signedName: string }) {
  if (db.processedWebhooks.includes(event.eventId)) return;
  db.processedWebhooks.push(event.eventId);

  const contract = db.contracts.find((c) => c.id === event.contractId);
  if (!contract || contract.status === "SIGNED" || contract.status === "VOID") return;
  contract.status = "SIGNED";
  contract.signedAt = nowIso();
  contract.signedName = event.signedName;

  const booking = must(db.bookings.find((b) => b.id === contract.bookingId), "Booking");
  activity(db, booking.leadId, "Contract signed", `Signed by ${event.signedName}.`);
  evaluateConfirmation(db, booking);
}

// ---------- Staff actions (demo stand-in for apps/admin) ----------

export const DEMO_ACTIONS = [
  "startAvailabilityCheck",
  "markAvailable",
  "markTentative",
  "markUnavailable",
  "recordRepAcceptance",
  "sendQuote",
  "sendContract",
  "completeEvent",
  "markPayoutPaid",
  "cancelBooking",
] as const;
export type DemoAction = (typeof DEMO_ACTIONS)[number];

export function runDemoAction(db: MockDb, bookingId: string, action: DemoAction, note?: string) {
  const booking = must(db.bookings.find((b) => b.id === bookingId), "Booking");
  const lead = must(leadOf(db, booking.leadId), "Lead");
  const name = talentName(booking.talentSlug);
  const needOpen = () => {
    if (booking.cancelledAt) throw new ApiError("CANCELLED", "This booking is cancelled");
  };

  switch (action) {
    case "startAvailabilityCheck": {
      needOpen();
      if (!lead.ownerName) {
        lead.ownerName = ACCOUNT_MANAGER.name;
        activity(db, lead.id, `${ACCOUNT_MANAGER.name} is your booking manager`, "She will keep you posted at every step.");
      }
      walkLead(db, lead, ["NEW", "CONTACTED", "REQUIREMENT_RECEIVED", "SHORTLISTED", "AVAILABILITY_CHECK"]);
      if (booking.availability !== "NOT_CHECKED") throw new ApiError("INVALID", "Availability check already started");
      booking.availability = "AWAITING_MANAGER";
      activity(db, lead.id, `Checking ${name}'s availability`, "We've asked the artist's representative to confirm the date.");
      return;
    }
    case "markAvailable":
    case "markTentative":
    case "markUnavailable": {
      needOpen();
      if (!["AWAITING_MANAGER", "HOLD_REQUESTED", "AVAILABLE", "TENTATIVE"].includes(booking.availability)) {
        throw new ApiError("INVALID", "Start the availability check first");
      }
      const next = action === "markAvailable" ? "AVAILABLE" : action === "markTentative" ? "TENTATIVE" : "UNAVAILABLE";
      booking.availability = next;
      const copy = {
        AVAILABLE: [`${name} is available`, "Your quote is being prepared."],
        TENTATIVE: [`${name} is tentatively available`, "The date is pencilled in; we'll firm it up with the quote."],
        UNAVAILABLE: [`${name} is not available on your date`, "Your manager will suggest similar artists."],
      } as const;
      activity(db, lead.id, copy[next][0], copy[next][1]);
      return;
    }
    case "recordRepAcceptance": {
      needOpen();
      if (booking.availability !== "AVAILABLE" && booking.availability !== "TENTATIVE") {
        throw new ApiError("INVALID", "The artist must be available first");
      }
      booking.repAcceptedAt = nowIso();
      activity(db, lead.id, `${name}'s team accepted the booking terms`);
      evaluateConfirmation(db, booking);
      return;
    }
    case "sendQuote": {
      needOpen();
      if (booking.availability !== "AVAILABLE" && booking.availability !== "TENTATIVE") {
        throw new ApiError("INVALID", "Confirm availability before quoting");
      }
      const open = quotesOf(db, booking.id);
      if (open.some((q) => q.status === "ACCEPTED")) throw new ApiError("INVALID", "A quote is already accepted");
      for (const q of open) if (q.status === "SENT") q.status = "SUPERSEDED";
      const quote = buildQuote(db, booking);
      db.quotes.push(quote);
      if (lead.stage === "AVAILABILITY_CHECK" || lead.stage === "NEGOTIATION") transitionLead(db, lead, "QUOTE_SENT");
      activity(db, lead.id, `Quote v${quote.version} ready for ${name}`, "Review the itemised quote and accept it online.");
      return;
    }
    case "sendContract": {
      needOpen();
      if (!quotesOf(db, booking.id).some((q) => q.status === "ACCEPTED")) {
        throw new ApiError("INVALID", "The customer must accept a quote first");
      }
      if (contractOf(db, booking.id)) throw new ApiError("INVALID", "Contract already sent");
      db.contracts.push({
        id: newId("con"),
        bookingId: booking.id,
        status: "SENT",
        sentAt: nowIso(),
        signedAt: null,
        signedName: null,
        providerRef: newId("env"),
      });
      activity(db, lead.id, `Contract sent for ${name}`, "Review and sign it online.");
      return;
    }
    case "completeEvent": {
      if (booking.availability !== "CONFIRMED") throw new ApiError("INVALID", "Only confirmed bookings can be completed");
      if (booking.completedAt) throw new ApiError("INVALID", "Already marked complete");
      const completionNote = note?.trim() || "Event delivered as planned.";
      booking.completedAt = nowIso();
      booking.completionNote = completionNote;
      if (lead.stage === "CONFIRMED") transitionLead(db, lead, "EVENT_COMPLETED", { completionNote });
      // SET-1: payout record equals the contracted payout.
      db.payouts.push({
        id: newId("pout"),
        bookingId: booking.id,
        amountPaise: booking.payoutTotalPaise ?? "0",
        status: "PENDING",
        paidAt: null,
      });
      activity(db, lead.id, "Event completed", "Thank you for booking with us. We'd love your feedback.");
      return;
    }
    case "markPayoutPaid": {
      const payout = must(db.payouts.find((p) => p.bookingId === booking.id), "Payout");
      payout.status = "PAID";
      payout.paidAt = nowIso();
      activity(db, lead.id, `Payout to ${name} marked paid`, null, true);
      if (lead.stage === "EVENT_COMPLETED") transitionLead(db, lead, "SETTLEMENT");
      const allPaid = bookingsOf(db, lead.id).every((b) => milestonesOf(db, b.id).every((m) => m.status === "PAID"));
      if (lead.stage === "SETTLEMENT" && allPaid) transitionLead(db, lead, "CLOSED");
      return;
    }
    case "cancelBooking": {
      needOpen();
      const reason = note?.trim();
      if (!reason) throw new ApiError("VALIDATION", "A cancellation reason is required");
      booking.cancelledAt = nowIso();
      booking.cancelReason = reason;
      releaseDate(db, booking.id);
      for (const m of milestonesOf(db, booking.id)) if (m.status !== "PAID") m.status = "CANCELLED";
      const live = bookingsOf(db, lead.id).filter((b) => !b.cancelledAt);
      if (live.length === 0 && (lead.stage === "ADVANCE_PENDING" || lead.stage === "CONFIRMED")) {
        transitionLead(db, lead, "CANCELLED", { reason });
      }
      activity(db, lead.id, `${name} booking cancelled`, `${reason} Any refund follows the cancellation policy.`);
      return;
    }
  }
}

// ---------- Talent portal ----------

// ---------- Calendar (AVL-4, TAL-3) — mirrors apps/api ----------

const longDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const readableDate = (date: string) => longDate.format(new Date(`${date}T00:00:00Z`));

export const seedCalendar = (): MockDb["calendar"] =>
  Object.fromEntries(Object.entries(BLACKOUT_SEED).map(([slug, dates]) => [slug, dates.map((date) => ({ date, source: "manager" as const, note: "Set at onboarding", bookingId: null }))]));

export function calendarFor(db: MockDb, slug: string): TalentCalendar {
  const rows = (db.calendar[slug] ?? []).toSorted((a, b) => a.date.localeCompare(b.date));
  const entries = rows.map<CalendarEntry>((r) => {
    const lead = r.bookingId ? leadOf(db, db.bookings.find((b) => b.id === r.bookingId)?.leadId ?? "") : undefined;
    return { date: r.date, source: r.source, note: r.note, ref: lead?.ref ?? null, leadId: lead?.id ?? null };
  });
  return { seeded: rows.filter((r) => r.source !== "artist").map((r) => r.date), all: rows.map((r) => r.date), entries, selfEdit: db.calendarSelfEdit[slug] ?? true };
}

export const isBlocked = (db: MockDb, slug: string, date: string) => (db.calendar[slug] ?? []).some((r) => r.date === date);

/** Blocks or clears a date. The talent team's dates are locked for the artist; booking holds for everyone. */
export function setCalendarDate(db: MockDb, slug: string, date: string, on: boolean, by: "manager" | "artist", note?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("VALIDATION", "Pick a valid date");
  if (on && date < toIstDateKey(new Date())) throw new ApiError("VALIDATION", "Blackout dates must be in the future");
  if (by === "artist" && db.calendarSelfEdit[slug] === false) throw new ApiError("FORBIDDEN", "Your manager looks after your calendar — ask them to change a date");
  const rows = (db.calendar[slug] ??= []);
  const existing = rows.find((r) => r.date === date);
  if (existing?.source === "booking") {
    const ref = leadOf(db, db.bookings.find((b) => b.id === existing.bookingId)?.leadId ?? "")?.ref;
    throw new ApiError("BOOKED", by === "artist" ? "You have a confirmed booking on this date" : `This date is held by booking ${ref}. Cancel that booking to free it.`);
  }
  if (by === "artist" && existing?.source === "manager") throw new ApiError("LOCKED", "This date was set by your manager — ask them to clear it");
  db.calendar[slug] = rows.filter((r) => r.date !== date);
  if (on) db.calendar[slug].push({ date, source: by, note: note?.trim() || null, bookingId: null });
}

/** Throws when any of these talents has the date blocked, naming them. */
export function assertDateOpen(db: MockDb, slugs: string[], date: string) {
  const names = slugs.filter((slug) => isBlocked(db, slug, date)).map(talentName);
  if (names.length === 0) return;
  const who = names.length === 1 ? `${names[0]} isn't` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} aren't`;
  throw new ApiError("DATE_BLOCKED", `${who} available on ${readableDate(date)}. Pick another date or remove them from the shortlist.`);
}

function holdDate(db: MockDb, booking: BookingRec, lead: LeadRec) {
  if (isBlocked(db, booking.talentSlug, lead.eventDate)) return;
  (db.calendar[booking.talentSlug] ??= []).push({ date: lead.eventDate, source: "booking", note: `Booked · ${lead.ref}`, bookingId: booking.id });
}

export function releaseDate(db: MockDb, bookingId: string) {
  for (const slug of Object.keys(db.calendar)) db.calendar[slug] = db.calendar[slug]!.filter((r) => r.bookingId !== bookingId);
}

// ---------- Messages (CUS-3) ----------

const MAX_MESSAGE = 2000;

function cleanMessage(body: string) {
  const text = body.trim();
  if (!text) throw new ApiError("VALIDATION", "Write a message first");
  if (text.length > MAX_MESSAGE) throw new ApiError("VALIDATION", `Keep messages under ${MAX_MESSAGE} characters`);
  return text;
}

export function leadMessages(db: MockDb, leadId: string) {
  return db.messages.filter((m) => m.thread.kind === "lead" && m.thread.leadId === leadId).toSorted((a, b) => a.at.localeCompare(b.at));
}

export function talentMessages(db: MockDb, bookingId: string) {
  return db.messages
    .filter((m) => m.thread.kind === "talent" && m.thread.bookingId === bookingId)
    .toSorted((a, b) => a.at.localeCompare(b.at));
}

export function postLeadMessage(db: MockDb, leadId: string, author: "customer" | "staff", authorName: string, body: string) {
  const lead = must(leadOf(db, leadId), "Booking");
  const message = { id: newId("msg"), thread: { kind: "lead" as const, leadId }, author, authorName, body: cleanMessage(body), at: nowIso() };
  db.messages.push(message);
  if (author === "staff" && !lead.ownerName) lead.ownerName = authorName;
  return message;
}

export function postTalentMessage(db: MockDb, bookingId: string, author: "talent" | "staff", authorName: string, body: string) {
  must(db.bookings.find((b) => b.id === bookingId), "Booking");
  const message = { id: newId("msg"), thread: { kind: "talent" as const, bookingId }, author, authorName, body: cleanMessage(body), at: nowIso() };
  db.messages.push(message);
  return message;
}

// ---------- Contact, applications, newsletter ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE = /^[6-9]\d{9}$/;

function requireText(value: string, label: string, min = 2, max = 2000) {
  const text = value.trim();
  if (text.length < min) throw new ApiError("VALIDATION", `Enter ${label}`);
  if (text.length > max) throw new ApiError("VALIDATION", `${label} is too long`);
  return text;
}

export function submitContactRequest(
  db: MockDb,
  input: { name: string; phone: string; email: string; topic: string; message: string },
) {
  if (!MOBILE.test(input.phone)) throw new ApiError("VALIDATION", "Enter a 10-digit Indian mobile number");
  if (input.email && !EMAIL.test(input.email)) throw new ApiError("VALIDATION", "Enter a valid email");
  db.seq += 1;
  const request = {
    id: newId("ctc"),
    ref: `CR-${String(db.seq).padStart(6, "0")}`,
    name: requireText(input.name, "your name", 2, 80),
    phone: input.phone,
    email: input.email.trim() || null,
    topic: requireText(input.topic, "a topic", 2, 60),
    message: requireText(input.message, "a message", 10),
    at: nowIso(),
  };
  db.contactRequests.push(request);
  return request;
}

export function submitTalentApplication(
  db: MockDb,
  input: { stageName: string; category: string; city: string; phone: string; email: string; representation: string; links: string; about: string },
) {
  if (!MOBILE.test(input.phone)) throw new ApiError("VALIDATION", "Enter a 10-digit Indian mobile number");
  if (!EMAIL.test(input.email)) throw new ApiError("VALIDATION", "Enter a valid email");
  const duplicate = db.talentApplications.find((a) => a.phone === input.phone && a.status !== "DECLINED");
  if (duplicate) throw new ApiError("DUPLICATE", `We already have your application (${duplicate.ref}). Our team will be in touch.`);
  db.seq += 1;
  const application = {
    id: newId("app"),
    ref: `AP-${String(db.seq).padStart(6, "0")}`,
    stageName: requireText(input.stageName, "your stage name", 2, 80),
    category: requireText(input.category, "a category"),
    city: requireText(input.city, "your base city"),
    phone: input.phone,
    email: input.email.trim(),
    representation: requireText(input.representation, "who manages your bookings"),
    links: requireText(input.links, "at least one link to your work", 8, 1000),
    about: requireText(input.about, "a short introduction", 20),
    status: "NEW" as const,
    at: nowIso(),
  };
  db.talentApplications.push(application);
  return application;
}

export function subscribeNewsletter(db: MockDb, email: string) {
  const clean = email.trim().toLowerCase();
  if (!EMAIL.test(clean)) throw new ApiError("VALIDATION", "Enter a valid email");
  if (db.newsletter.some((entry) => entry.email === clean)) return { alreadySubscribed: true };
  db.newsletter.push({ email: clean, at: nowIso() });
  return { alreadySubscribed: false };
}
