import type { LineItemType } from "@repo/schemas";
import { computeQuoteTotals, type LeadStage } from "@repo/utils";
import { TALENTS } from "./catalogue/data";
import { rateCardFor } from "./talent-admin";
import { MINIMUM_RATE_BPS, QUOTE_MARGIN_FLOOR_BPS, internalFor, minimumRateFor, type StaffRole, type StaffUser } from "./internal";
import {
  ApiError,
  activity,
  addDays,
  bookingsOf,
  buildQuote,
  evaluateConfirmation,
  leadOf,
  milestonesOf,
  newId,
  nowIso,
  postLeadMessage,
  postTalentMessage,
  quotesOf,
  runDemoAction,
  setBlackout,
  transitionLead,
  type DemoAction,
} from "./server";
import type { MockDb, QuoteLineRec, QuoteRec, TalentApplicationRec } from "./types";

// Staff (apps/admin) actions. Every mutation checks the role and writes an audit entry (AUD-1).

export function can(actor: StaffUser, ...roles: StaffRole[]) {
  return actor.roles.includes("SUPER_ADMIN") || roles.some((role) => actor.roles.includes(role));
}

function requireRole(actor: StaffUser, ...roles: StaffRole[]) {
  if (!can(actor, ...roles)) throw new ApiError("FORBIDDEN", "Your role can't do that");
}

/** P5 / ANA-3: margin, receivables and payouts are for finance and admins. */
export const seesFinance = (actor: StaffUser) => can(actor, "ACCOUNTS");

export function audit(db: MockDb, actor: StaffUser, action: string, entity: string, entityId: string, summary: string) {
  db.audit.push({ id: newId("aud"), at: nowIso(), actorId: actor.id, actorName: actor.name, action, entity, entityId, summary });
}

const talentName = (slug: string) => TALENTS.find((t) => t.slug === slug)?.stageName ?? slug;

function mustLead(db: MockDb, leadId: string) {
  const lead = leadOf(db, leadId);
  if (!lead) throw new ApiError("NOT_FOUND", "Lead not found");
  return lead;
}

function mustBooking(db: MockDb, bookingId: string) {
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new ApiError("NOT_FOUND", "Booking not found");
  return booking;
}

// ---------- Leads ----------

export function assignOwner(db: MockDb, actor: StaffUser, leadId: string, ownerName: string) {
  requireRole(actor, "SALES");
  const lead = mustLead(db, leadId);
  lead.ownerName = ownerName;
  activity(db, lead.id, `${ownerName} is your booking manager`, "They'll keep you posted at every step.");
  audit(db, actor, "lead.assign", "Lead", lead.ref, `Owner → ${ownerName}`);
}

export function moveStage(db: MockDb, actor: StaffUser, leadId: string, to: LeadStage, reason?: string) {
  requireRole(actor, "SALES");
  const lead = mustLead(db, leadId);
  const from = lead.stage;
  transitionLead(db, lead, to, { reason, completionNote: reason });
  if (to === "LOST") lead.lostReason = reason ?? null;
  audit(db, actor, "lead.transition", "Lead", lead.ref, `${from} → ${to}${reason ? ` (${reason})` : ""}`);
}

export function addTalentToLead(db: MockDb, actor: StaffUser, leadId: string, slug: string) {
  requireRole(actor, "SALES", "TALENT_MANAGER");
  const lead = mustLead(db, leadId);
  if (!TALENTS.some((t) => t.slug === slug)) throw new ApiError("NOT_FOUND", "Unknown artist");
  if (bookingsOf(db, lead.id).some((b) => b.talentSlug === slug)) throw new ApiError("DUPLICATE", "Already on this lead");
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
  activity(db, lead.id, `${talentName(slug)} added to your shortlist`, "We'll check their availability for your date.");
  audit(db, actor, "lead.addTalent", "Lead", lead.ref, talentName(slug));
}

export function addInternalNote(db: MockDb, actor: StaffUser, leadId: string, text: string) {
  const lead = mustLead(db, leadId);
  if (!text.trim()) throw new ApiError("VALIDATION", "Write a note first");
  activity(db, lead.id, `Note from ${actor.name}`, text.trim(), true);
  audit(db, actor, "lead.note", "Lead", lead.ref, "Internal note added");
}

export function replyToCustomer(db: MockDb, actor: StaffUser, leadId: string, body: string) {
  const lead = mustLead(db, leadId);
  postLeadMessage(db, lead.id, "staff", actor.name, body);
  audit(db, actor, "message.customer", "Lead", lead.ref, "Replied to customer");
}

export function replyToTalent(db: MockDb, actor: StaffUser, bookingId: string, body: string) {
  const booking = mustBooking(db, bookingId);
  postTalentMessage(db, booking.id, "staff", actor.name, body);
  audit(db, actor, "message.talent", "Booking", booking.id, `Replied to ${talentName(booking.talentSlug)}`);
}

// ---------- Booking actions ----------

const ACTION_ROLES: Partial<Record<DemoAction, StaffRole[]>> = {
  startAvailabilityCheck: ["SALES", "TALENT_MANAGER"],
  markAvailable: ["TALENT_MANAGER", "SALES"],
  markTentative: ["TALENT_MANAGER", "SALES"],
  markUnavailable: ["TALENT_MANAGER", "SALES"],
  recordRepAcceptance: ["TALENT_MANAGER"],
  sendContract: ["SALES", "OPS"],
  completeEvent: ["OPS"],
  markPayoutPaid: ["ACCOUNTS"],
  cancelBooking: ["SALES", "OPS"],
};

export function bookingAction(db: MockDb, actor: StaffUser, bookingId: string, action: DemoAction, note?: string) {
  const roles = ACTION_ROLES[action];
  if (!roles) throw new ApiError("FORBIDDEN", "Use the quote builder to send quotes");
  requireRole(actor, ...roles);
  const booking = mustBooking(db, bookingId);
  runDemoAction(db, booking.id, action, note);
  const lead = mustLead(db, booking.leadId);
  audit(db, actor, `booking.${action}`, "Booking", lead.ref, `${talentName(booking.talentSlug)}${note ? ` — ${note}` : ""}`);
}

// ---------- Quote builder (QUO-1…6) ----------

export type QuoteDraftLine = { type: LineItemType; description: string; customerAmountPaise: string; internalCostPaise: string; taxRateBps: number };
export type QuoteDraft = { lines: QuoteDraftLine[]; validDays: number; advanceBps: number };
export type QuoteRate = { sellingRatePaise: string; minimumRatePaise: string; marginFloorBps: number };

/** Prefills the builder from the rate card. */
export function draftQuote(db: MockDb, bookingId: string): QuoteDraft & { rate: QuoteRate } {
  const booking = mustBooking(db, bookingId);
  const quote = buildQuote(db, booking);
  return {
    lines: quote.lineItems.map((line) => ({ ...line })),
    validDays: 7,
    advanceBps: 5000,
    rate: {
      sellingRatePaise: rateCardFor(db, booking.talentSlug).sellingRatePaise,
      minimumRatePaise: rateCardFor(db, booking.talentSlug).minimumRatePaise,
      marginFloorBps: QUOTE_MARGIN_FLOOR_BPS,
    },
  };
}

export function quoteChecks(slug: string, lines: QuoteDraftLine[], card?: { sellingRatePaise: string; minimumRatePaise: string }) {
  const totals = computeQuoteTotals(lines.map((l) => ({ customerAmountPaise: BigInt(l.customerAmountPaise || "0"), taxRateBps: l.taxRateBps })));
  const cost = lines.reduce((sum, l) => sum + BigInt(l.internalCostPaise || "0"), 0n);
  const marginPaise = totals.subtotalPaise - cost;
  const marginBps = totals.subtotalPaise > 0n ? Number((marginPaise * 10_000n) / totals.subtotalPaise) : 0;
  const fee = lines.filter((l) => l.type === "TALENT_FEE").reduce((sum, l) => sum + BigInt(l.customerAmountPaise || "0"), 0n);
  const minimum = card ? BigInt(card.minimumRatePaise) : minimumRateFor(slug);
  const reasons = [
    ...(fee < minimum ? [card ? "Artist fee is below the minimum rate" : `Artist fee is below the minimum rate (${MINIMUM_RATE_BPS / 100}% of the standard rate)`] : []),
    ...(marginBps < QUOTE_MARGIN_FLOOR_BPS ? [`Margin is below the ${QUOTE_MARGIN_FLOOR_BPS / 100}% floor`] : []),
  ];
  return { ...totals, costPaise: cost, marginPaise, marginBps, minimumRatePaise: minimum, sellingRatePaise: card ? BigInt(card.sellingRatePaise) : internalFor(slug).sellingRatePaise, needsApproval: reasons.length > 0, reasons };
}

function validateDraft(draft: QuoteDraft) {
  if (draft.lines.length === 0) throw new ApiError("VALIDATION", "Add at least one line");
  if (!draft.lines.some((l) => l.type === "TALENT_FEE")) throw new ApiError("VALIDATION", "Include the artist fee");
  for (const line of draft.lines) {
    if (!line.description.trim()) throw new ApiError("VALIDATION", "Every line needs a description");
    if (!/^\d+$/.test(line.customerAmountPaise) || !/^\d+$/.test(line.internalCostPaise)) throw new ApiError("VALIDATION", "Amounts must be whole rupees");
    if (![0, 500, 1200, 1800, 2800].includes(line.taxRateBps)) throw new ApiError("VALIDATION", "Pick a valid GST rate");
  }
  if (draft.validDays < 1 || draft.validDays > 30) throw new ApiError("VALIDATION", "Validity must be 1–30 days");
  if (draft.advanceBps < 1000 || draft.advanceBps > 10_000) throw new ApiError("VALIDATION", "Advance must be 10–100%");
}

export function createQuote(db: MockDb, actor: StaffUser, bookingId: string, draft: QuoteDraft): QuoteRec {
  requireRole(actor, "SALES");
  validateDraft(draft);
  const booking = mustBooking(db, bookingId);
  const lead = mustLead(db, booking.leadId);
  if (booking.cancelledAt) throw new ApiError("CANCELLED", "This booking is cancelled");
  if (booking.availability !== "AVAILABLE" && booking.availability !== "TENTATIVE") {
    throw new ApiError("INVALID", "Confirm availability before quoting");
  }
  const existing = quotesOf(db, booking.id);
  if (existing.some((q) => q.status === "ACCEPTED")) throw new ApiError("INVALID", "A quote is already accepted");

  const checks = quoteChecks(booking.talentSlug, draft.lines, db.talentRecords[booking.talentSlug]?.rateCard ?? undefined);
  for (const q of existing) if (q.status === "SENT" || q.status === "PENDING_APPROVAL") q.status = "SUPERSEDED";
  const lines: QuoteLineRec[] = draft.lines.map((l) => ({ ...l, description: l.description.trim() }));
  const quote: QuoteRec = {
    id: newId("quo"),
    bookingId: booking.id,
    version: (existing[0]?.version ?? 0) + 1,
    status: checks.needsApproval ? "PENDING_APPROVAL" : "SENT",
    validUntil: addDays(new Date(), draft.validDays).toISOString(),
    subtotalPaise: String(checks.subtotalPaise),
    taxPaise: String(checks.taxPaise),
    totalPaise: String(checks.totalPaise),
    internalCostPaise: String(checks.costPaise),
    acceptedAt: null,
    acceptedByUserId: null,
    acceptedIp: null,
    changeRequest: null,
    lineItems: lines,
    milestonePlan: [
      { label: "Advance", percentBps: draft.advanceBps },
      ...(draft.advanceBps < 10_000 ? [{ label: "Balance", percentBps: 10_000 - draft.advanceBps }] : []),
    ],
    createdAt: nowIso(),
  };
  db.quotes.push(quote);
  if (quote.status === "SENT") publishQuote(db, lead, quote, booking.talentSlug);
  audit(db, actor, "quote.create", "Quote", lead.ref, `v${quote.version} ${quote.status === "SENT" ? "sent" : "sent for approval"} — ${checks.reasons.join("; ") || "within rules"}`);
  return quote;
}

function publishQuote(db: MockDb, lead: ReturnType<typeof mustLead>, quote: QuoteRec, slug: string) {
  if (lead.stage === "AVAILABILITY_CHECK" || lead.stage === "NEGOTIATION") transitionLead(db, lead, "QUOTE_SENT");
  activity(db, lead.id, `Quote v${quote.version} ready for ${talentName(slug)}`, "Review the itemised quote and accept it online.");
}

export function approveQuote(db: MockDb, actor: StaffUser, quoteId: string) {
  requireRole(actor, "SUPER_ADMIN");
  const quote = db.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status !== "PENDING_APPROVAL") throw new ApiError("INVALID", "Nothing to approve");
  const booking = mustBooking(db, quote.bookingId);
  const lead = mustLead(db, booking.leadId);
  quote.status = "SENT";
  publishQuote(db, lead, quote, booking.talentSlug);
  audit(db, actor, "quote.approve", "Quote", lead.ref, `v${quote.version} approved and sent`);
}

export function rejectQuote(db: MockDb, actor: StaffUser, quoteId: string, reason: string) {
  requireRole(actor, "SUPER_ADMIN");
  const quote = db.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status !== "PENDING_APPROVAL") throw new ApiError("INVALID", "Nothing to reject");
  if (!reason.trim()) throw new ApiError("VALIDATION", "Give a reason so sales can revise it");
  const lead = mustLead(db, mustBooking(db, quote.bookingId).leadId);
  quote.status = "REJECTED";
  activity(db, lead.id, `Quote v${quote.version} rejected by ${actor.name}`, reason.trim(), true);
  audit(db, actor, "quote.reject", "Quote", lead.ref, `v${quote.version}: ${reason.trim()}`);
}

// ---------- Payments (PAY-1, PAY-4) ----------

export function sendPaymentLink(db: MockDb, actor: StaffUser, milestoneId: string) {
  requireRole(actor, "ACCOUNTS", "SALES");
  const milestone = db.milestones.find((m) => m.id === milestoneId);
  if (!milestone) throw new ApiError("NOT_FOUND", "Milestone not found");
  if (milestone.status !== "PENDING" && milestone.status !== "OVERDUE") throw new ApiError("INVALID", "A link was already sent or it's paid");
  milestone.status = "LINK_SENT";
  const booking = mustBooking(db, milestone.bookingId);
  const lead = mustLead(db, booking.leadId);
  activity(db, lead.id, `Payment link sent: ${milestone.label}`, "Pay from your booking page whenever you're ready.");
  audit(db, actor, "payment.link", "Milestone", lead.ref, `${milestone.label} link sent`);
}

export function recordManualPayment(db: MockDb, actor: StaffUser, milestoneId: string, reference: string) {
  requireRole(actor, "ACCOUNTS");
  const milestone = db.milestones.find((m) => m.id === milestoneId);
  if (!milestone) throw new ApiError("NOT_FOUND", "Milestone not found");
  if (milestone.status === "PAID" || milestone.status === "CANCELLED") throw new ApiError("INVALID", "This milestone is closed");
  if (reference.trim().length < 4) throw new ApiError("VALIDATION", "Enter the bank transfer reference (UTR)");
  db.payments.push({
    id: newId("pay"),
    milestoneId: milestone.id,
    method: "bank_transfer",
    gatewayPaymentId: reference.trim(),
    amountPaise: milestone.amountPaise,
    status: "captured",
    receivedAt: nowIso(),
  });
  milestone.status = "PAID";
  milestone.paidAt = nowIso();
  const booking = mustBooking(db, milestone.bookingId);
  const lead = mustLead(db, booking.leadId);
  activity(db, lead.id, `${milestone.label} payment received`, `Bank transfer ref ${reference.trim()}.`);
  audit(db, actor, "payment.manual", "Milestone", lead.ref, `${milestone.label} marked paid (UTR ${reference.trim()})`);
  evaluateConfirmation(db, booking);
}

// ---------- Talent team ----------

export function setApplicationStatus(db: MockDb, actor: StaffUser, applicationId: string, status: TalentApplicationRec["status"]) {
  requireRole(actor, "TALENT_MANAGER");
  const application = db.talentApplications.find((a) => a.id === applicationId);
  if (!application) throw new ApiError("NOT_FOUND", "Application not found");
  application.status = status;
  audit(db, actor, "application.status", "Application", application.ref, `${application.stageName} → ${status}`);
}

export function staffSetBlackout(db: MockDb, actor: StaffUser, slug: string, date: string, on: boolean) {
  requireRole(actor, "TALENT_MANAGER");
  setBlackout(db, slug, date, on);
  audit(db, actor, on ? "blackout.add" : "blackout.remove", "Talent", slug, date);
}

// ---------- Analytics (ANA-1, ANA-3) ----------

export function analytics(db: MockDb, actor: StaffUser) {
  const leads = db.leads;
  const bookings = db.bookings;
  const byStage = leads.reduce<Record<string, number>>((acc, lead) => ({ ...acc, [lead.stage]: (acc[lead.stage] ?? 0) + 1 }), {});
  const quoted = new Set(db.quotes.filter((q) => q.status !== "DRAFT" && q.status !== "PENDING_APPROVAL").map((q) => mustBooking(db, q.bookingId).leadId));
  const confirmed = bookings.filter((b) => b.confirmedAt && !b.cancelledAt);
  const gmv = confirmed.reduce((sum, b) => sum + BigInt(b.sellingTotalPaise ?? "0"), 0n);
  const confirmDays = confirmed
    .map((b) => (new Date(b.confirmedAt!).getTime() - new Date(mustLead(db, b.leadId).createdAt).getTime()) / 86_400_000)
    .filter((d) => d >= 0);

  const finance = seesFinance(actor)
    ? {
        marginPaise: String(confirmed.reduce((sum, b) => sum + BigInt(b.marginPaise ?? "0"), 0n)),
        receivablesPaise: String(
          db.milestones
            .filter((m) => m.status !== "PAID" && m.status !== "CANCELLED" && db.quotes.some((q) => q.bookingId === m.bookingId && q.status === "ACCEPTED"))
            .reduce((sum, m) => sum + BigInt(m.amountPaise), 0n),
        ),
        pendingPayoutsPaise: String(db.payouts.filter((p) => p.status !== "PAID").reduce((sum, p) => sum + BigInt(p.amountPaise), 0n)),
      }
    : null;

  return {
    leadCount: leads.length,
    openLeads: leads.filter((l) => !["CLOSED", "LOST", "CANCELLED"].includes(l.stage)).length,
    byStage,
    confirmedBookings: confirmed.length,
    gmvPaise: String(gmv),
    avgBookingPaise: confirmed.length ? String(gmv / BigInt(confirmed.length)) : "0",
    enquiryToQuoteBps: leads.length ? Math.round((quoted.size / leads.length) * 10_000) : 0,
    quoteToConfirmedBps: quoted.size ? Math.round((new Set(confirmed.map((b) => b.leadId)).size / quoted.size) * 10_000) : 0,
    avgDaysToConfirm: confirmDays.length ? Math.round((confirmDays.reduce((a, b) => a + b, 0) / confirmDays.length) * 10) / 10 : null,
    pendingApprovals: db.quotes.filter((q) => q.status === "PENDING_APPROVAL").length,
    newApplications: db.talentApplications.filter((a) => a.status === "NEW").length,
    newContactRequests: db.contactRequests.length,
    finance,
  };
}

export { milestonesOf };
