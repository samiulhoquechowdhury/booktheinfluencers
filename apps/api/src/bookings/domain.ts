import type { LeadStage, Prisma } from "@repo/db";
import { canTransition, isConfirmable, splitIntoMilestones } from "@repo/utils";
import { DomainError, notFound } from "../common/errors";
import { notifyCustomer, notifyStaff, notifyTalent } from "@repo/db";
import { dateClashMessage } from "@repo/schemas";

// Booking rules shared by customer, staff and webhook flows. Always called inside a transaction
// (rules.md §3): `tx` is the transaction client.

type Tx = Prisma.TransactionClient;

export async function nextRef(tx: Tx, counter: string, prefix: string, width = 6) {
  const row = await tx.counter.upsert({ where: { name: counter }, create: { name: counter, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}${String(row.value).padStart(width, "0")}`;
}

export const activity = (tx: Tx, leadId: string, title: string, body: string | null = null, internal = false, actorId?: string) =>
  tx.activity.create({ data: { leadId, title, body, internal, actorId } });

/** Every stage change goes through the shared state machine (trd.md §5). */
export async function transitionLead(
  tx: Tx,
  leadId: string,
  to: LeadStage,
  opts: { actor?: "staff" | "system"; reason?: string; completionNote?: string; actorId?: string } = {},
) {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    include: { bookings: { include: { quotes: true, milestones: true, payout: true } } },
  });
  if (!lead) throw notFound("Lead");
  const quotes = lead.bookings.flatMap((b) => b.quotes);
  const milestones = lead.bookings.flatMap((b) => b.milestones);
  const result = canTransition(lead.stage, to, {
    actor: opts.actor ?? "staff",
    ownerSet: Boolean(lead.ownerId),
    bookingCount: lead.bookings.length,
    anyAvailable: lead.bookings.some((b) => b.availability === "AVAILABLE" || b.availability === "TENTATIVE"),
    hasSentQuote: quotes.some((q) => q.status === "SENT"),
    hasAcceptedQuote: quotes.some((q) => q.status === "ACCEPTED"),
    reason: opts.reason,
    completionNote: opts.completionNote,
    payoutPaid: lead.bookings.every((b) => b.payout?.status === "PAID"),
    allMilestonesPaid: milestones.length > 0 && milestones.every((m) => m.status === "PAID"),
  });
  if (!result.ok) throw new DomainError("INVALID_TRANSITION", result.reason, 409);
  await tx.lead.update({ where: { id: leadId }, data: { stage: to, ...(to === "LOST" && { lostReason: opts.reason }) } });
  if (to === "LOST" || to === "CANCELLED") await tx.blackout.deleteMany({ where: { bookingId: { in: lead.bookings.map((b) => b.id) } } });
  await activity(tx, leadId, `Stage: ${lead.stage} → ${to}`, opts.reason ?? opts.completionNote ?? null, true, opts.actorId);
}

// ---------- Calendar (AVL-4, CAT-4) ----------

const longDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const readableDate = (date: string) => longDate.format(new Date(`${date}T00:00:00Z`));

/** Throws when any of these talents has the date blocked, naming them so the caller can fix the brief. */
export async function assertDateOpen(tx: Tx, talentIds: string[], date: string) {
  const rows = await tx.blackout.findMany({ where: { talentId: { in: talentIds }, date }, include: { talent: { select: { stageName: true } } } });
  if (rows.length === 0) return;
  const names = rows.map((r) => r.talent.stageName);
  throw new DomainError("DATE_BLOCKED", dateClashMessage(names, readableDate(date), rows.every((r) => r.bookingId)), 409, { field: "eventDate", talents: names });
}

/** A confirmed booking holds the artist's date, so they drop out of date searches and can't be double-booked. */
async function holdDate(tx: Tx, booking: { id: string; talentId: string }, date: string, ref: string) {
  const existing = await tx.blackout.findUnique({ where: { talentId_date: { talentId: booking.talentId, date } } });
  if (!existing) await tx.blackout.create({ data: { talentId: booking.talentId, date, locked: true, bookingId: booking.id, note: `Booked · ${ref}` } });
}

/** The first to confirm gets the date: other open requests for it are told now, before they pay. */
async function closeRivals(tx: Tx, booking: { id: string; talentId: string; talent: { stageName: string } }, date: string) {
  const rivals = await tx.booking.findMany({
    where: { id: { not: booking.id }, talentId: booking.talentId, cancelledAt: null, confirmedAt: null, availability: { not: "UNAVAILABLE" }, lead: { eventDate: date, stage: { notIn: ["CLOSED", "LOST", "CANCELLED"] } } },
    include: { lead: true },
  });
  const name = booking.talent.stageName;
  for (const rival of rivals) {
    await tx.booking.update({ where: { id: rival.id }, data: { availability: "UNAVAILABLE" } });
    await activity(tx, rival.leadId, `${name} is no longer available`, `${name} has been booked for ${readableDate(date)}.`);
    await notifyCustomer(tx, rival.leadId, { event: "booking.dateTaken", subject: "That date has been taken", body: `${name} has been booked for ${readableDate(date)} by another customer. Pick another date from their calendar, or your manager will suggest similar artists.`, dedupeKey: `booking.dateTaken:${rival.id}` });
    if (rival.lead.ownerId) await notifyStaff(tx, rival.lead.ownerId, { event: "booking.dateTaken", subject: `${rival.lead.ref}: ${name} was booked by someone else`, body: `${name} was confirmed on another booking for ${readableDate(date)}. Offer this customer another date or artist.`, leadId: rival.leadId });
  }
}

/** Frees a date held by a booking that's cancelled. Blocks added by hand stay. */
export const releaseDate = (tx: Tx, bookingId: string) => tx.blackout.deleteMany({ where: { bookingId } });

/** OPS-1 / AVL-3: the only path to CONFIRMED. Run after quote acceptance, signature, advance payment and rep acceptance. */
export async function evaluateConfirmation(tx: Tx, bookingId: string) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { quotes: { include: { lineItems: true } }, contracts: true, milestones: true, talent: true, lead: true },
  });
  if (!booking || booking.availability === "CONFIRMED" || booking.cancelledAt) return;
  const quote = booking.quotes.find((q) => q.status === "ACCEPTED");
  const confirmable = isConfirmable({
    quoteAccepted: Boolean(quote),
    contractSigned: booking.contracts.some((c) => c.status === "SIGNED"),
    advancePaid: booking.milestones.some((m) => m.isAdvance && m.status === "PAID"),
    repAccepted: Boolean(booking.repAcceptedAt),
  });
  if (!confirmable || !quote) return;

  // Two customers can reach this point for one date (money can come in by bank transfer). Only the first is confirmed.
  const held = await tx.blackout.findUnique({ where: { talentId_date: { talentId: booking.talentId, date: booking.lead.eventDate } } });
  if (held?.bookingId && held.bookingId !== booking.id) {
    await activity(tx, booking.leadId, `Can't confirm ${booking.talent.stageName}: date already booked`, "Another customer confirmed this date first. Refund the advance or move this booking to another date.", true);
    return;
  }

  const payout = quote.lineItems.find((l) => l.type === "TALENT_FEE")?.internalCostPaise ?? 0n;
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      availability: "CONFIRMED",
      confirmedAt: new Date(),
      sellingTotalPaise: quote.totalPaise,
      payoutTotalPaise: payout,
      marginPaise: quote.subtotalPaise - quote.internalCostPaise,
    },
  });
  await holdDate(tx, booking, booking.lead.eventDate, booking.lead.ref);
  await closeRivals(tx, booking, booking.lead.eventDate);
  if (booking.lead.stage === "ADVANCE_PENDING") await transitionLead(tx, booking.leadId, "CONFIRMED", { actor: "system" });
  await activity(tx, booking.leadId, `${booking.talent.stageName} is confirmed`, "Contract signed, advance received and the artist's team has accepted.");
  await notifyCustomer(tx, booking.leadId, { event: "booking.confirmed", subject: "Your booking is confirmed", body: `${booking.talent.stageName} is confirmed for your event.` });
  await notifyTalent(tx, booking.id, { event: "booking.confirmed", subject: "Booking confirmed", body: `Booking confirmed: ${booking.lead.eventType} in ${booking.lead.city} on ${booking.lead.eventDate}.` });
}

const DAY = 86_400_000;

/** Payment schedule from the accepted quote: advance within 3 days, balance a week before the event. */
export async function createMilestones(tx: Tx, quote: { id: string; bookingId: string; totalPaise: bigint; milestonePlan: unknown }, eventDate: string) {
  const plan = quote.milestonePlan as { label: string; percentBps: number }[];
  const eventDay = new Date(`${eventDate}T00:00:00+05:30`).getTime();
  const advanceDue = Math.min(Date.now() + 3 * DAY, eventDay);
  const balanceDue = Math.max(eventDay - 7 * DAY, advanceDue);
  const parts = splitIntoMilestones(quote.totalPaise, plan);
  await tx.paymentMilestone.createMany({
    data: parts.map((part, index) => ({
      bookingId: quote.bookingId,
      label: part.label,
      amountPaise: part.amountPaise,
      dueDate: new Date(index === 0 ? advanceDue : balanceDue),
      isAdvance: index === 0,
    })),
  });
}

/** PAY-3: verified, de-duplicated gateway events are the only way money is marked received. */
export async function applyGatewayEvent(
  tx: Tx,
  event: { eventId: string; milestoneId: string; gatewayPaymentId: string; amountPaise: string; method: string; status: "captured" | "failed" },
) {
  const fresh = await tx.webhookEvent.createMany({ data: [{ id: event.eventId, provider: "payments", payload: event }], skipDuplicates: true });
  if (fresh.count === 0) return { duplicate: true };

  const milestone = await tx.paymentMilestone.findUnique({ where: { id: event.milestoneId }, include: { booking: true } });
  const done = () => tx.webhookEvent.update({ where: { id: event.eventId }, data: { processedAt: new Date() } });
  if (!milestone || milestone.status === "PAID" || event.status !== "captured" || BigInt(event.amountPaise) !== milestone.amountPaise) {
    await done(); // Failed or mismatched payments stay for Accounts to reconcile.
    return { duplicate: false, applied: false };
  }
  await tx.payment.create({
    data: {
      milestoneId: milestone.id,
      method: event.method,
      gatewayPaymentId: event.gatewayPaymentId,
      amountPaise: milestone.amountPaise,
      status: "captured",
      receivedAt: new Date(),
    },
  });
  await tx.paymentMilestone.update({ where: { id: milestone.id }, data: { status: "PAID", paidAt: new Date() } });
  await activity(tx, milestone.booking.leadId, `${milestone.label} payment received`, `Payment ref ${event.gatewayPaymentId}.`);
  await notifyCustomer(tx, milestone.booking.leadId, { event: "payment.received", subject: "Payment received", body: `We received your ${milestone.label.toLowerCase()} payment. Thank you!` });
  await evaluateConfirmation(tx, milestone.bookingId);
  await done();
  return { duplicate: false, applied: true };
}

export async function applyEsignEvent(tx: Tx, event: { eventId: string; contractId: string; signedName: string }) {
  const fresh = await tx.webhookEvent.createMany({ data: [{ id: event.eventId, provider: "esign", payload: event }], skipDuplicates: true });
  if (fresh.count === 0) return { duplicate: true };
  const contract = await tx.contract.findUnique({ where: { id: event.contractId }, include: { booking: true } });
  if (contract && contract.status !== "SIGNED" && contract.status !== "VOID") {
    await tx.contract.update({ where: { id: contract.id }, data: { status: "SIGNED", signedAt: new Date(), signedName: event.signedName } });
    await activity(tx, contract.booking.leadId, "Contract signed", `Signed by ${event.signedName}.`);
    await notifyCustomer(tx, contract.booking.leadId, { event: "contract.signed", subject: "Contract signed", body: "Your signed contract is saved on your booking page." });
    await evaluateConfirmation(tx, contract.bookingId);
  }
  await tx.webhookEvent.update({ where: { id: event.eventId }, data: { processedAt: new Date() } });
  return { duplicate: false };
}
