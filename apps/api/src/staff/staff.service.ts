import { Inject, Injectable } from "@nestjs/common";
import type { ApplicationStatus, LeadStage, LineItemType, Prisma, Role } from "@repo/db";
import type { TalentCalendar } from "@repo/schemas";
import { allowedNextStages, computeQuoteTotals } from "@repo/utils";
import { DomainError, forbidden, notFound } from "../common/errors";
import type { AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { calendarOf } from "../talent/calendar";
import { activity, assertDateOpen, evaluateConfirmation, releaseDate, transitionLead } from "../bookings/domain";
import { notifyCustomer, notifyStaff } from "@repo/db";

type Tx = Prisma.TransactionClient;

/** QUO-6: placeholder floor (docs/memory.md open question). */
export const QUOTE_MARGIN_FLOOR_BPS = 1000;
const GST_RATES = [0, 500, 1200, 1800, 2800];

export const can = (user: AuthUser, ...roles: Role[]) => user.roles.includes("SUPER_ADMIN") || roles.some((r) => user.roles.includes(r));
export const seesFinance = (user: AuthUser) => can(user, "ACCOUNTS");

export type QuoteDraftLine = { type: LineItemType; description: string; customerAmountPaise: string; internalCostPaise: string; taxRateBps: number };
export type QuoteDraft = { lines: QuoteDraftLine[]; validDays: number; advanceBps: number };
/** What the builder needs to preview the approval rules (QUO-6) as staff type. */
export type QuoteRate = { sellingRatePaise: string; minimumRatePaise: string; marginFloorBps: number };

export const BOOKING_ACTIONS = {
  startAvailabilityCheck: ["SALES", "TALENT_MANAGER"],
  markAvailable: ["TALENT_MANAGER", "SALES"],
  markTentative: ["TALENT_MANAGER", "SALES"],
  markUnavailable: ["TALENT_MANAGER", "SALES"],
  recordRepAcceptance: ["TALENT_MANAGER"],
  sendContract: ["SALES", "OPS"],
  completeEvent: ["OPS"],
  markPayoutPaid: ["ACCOUNTS"],
  cancelBooking: ["SALES", "OPS"],
} as const satisfies Record<string, Role[]>;
export type BookingAction = keyof typeof BOOKING_ACTIONS;

const leadDetailInclude = {
  owner: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  bookings: {
    orderBy: { createdAt: "asc" },
    include: {
      talent: { include: { reps: { include: { rep: true } } } },
      quotes: { orderBy: { version: "desc" }, include: { lineItems: { orderBy: { position: "asc" } } } },
      contracts: true,
      milestones: { orderBy: { dueDate: "asc" }, include: { payments: true } },
      payout: true,
      _count: { select: { messages: true } },
    },
  },
  activities: { orderBy: { createdAt: "desc" } },
  messages: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class StaffService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private require(user: AuthUser, ...roles: Role[]) {
    if (!can(user, ...roles)) throw forbidden("Your role can't do that");
  }

  /** AUD-1/2: every staff mutation is logged with who, what and when. */
  private async audit(tx: Tx, user: AuthUser, action: string, entity: string, entityId: string, summary: string) {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await tx.auditLog.create({ data: { actorId: user.id, actorName: actor?.name ?? "Unknown", action, entity, entityId, summary } });
  }

  // ---------- Reads ----------

  async listLeads() {
    const leads = await this.prisma.db.lead.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true } },
        customer: { select: { phone: true } },
        bookings: { include: { talent: { select: { slug: true, stageName: true, categories: { include: { category: true } } } }, quotes: true } },
        followUps: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true } },
      },
    });
    return leads.map((lead) => {
      const value = lead.bookings
        .map((b) => b.quotes.filter((q) => q.status !== "SUPERSEDED" && q.status !== "REJECTED").sort((a, b) => b.version - a.version)[0]?.totalPaise)
        .filter((v): v is bigint => v !== undefined)
        .reduce((sum, v) => sum + v, 0n);
      return {
        id: lead.id,
        ref: lead.ref,
        stage: lead.stage,
        ownerName: lead.owner?.name ?? null,
        eventType: lead.eventType,
        eventDate: lead.eventDate,
        city: lead.city,
        contactName: lead.contactName,
        customerPhone: lead.customer.phone ?? "",
        createdAt: lead.createdAt,
        categories: [...new Set(lead.bookings.flatMap((b) => b.talent.categories.map((c) => c.category.slug)))],
        valuePaise: value > 0n ? value : null,
        bookings: lead.bookings.map((b) => ({ id: b.id, slug: b.talent.slug, name: b.talent.stageName, availability: b.availability })),
        /** Soonest open follow-up, for the pipeline badge. */
        nextFollowUpAt: lead.followUps[0]?.dueAt.toISOString() ?? null,
        /** A quote is waiting for a super admin, so the customer hasn't seen it yet. */
        awaitingApproval: lead.bookings.some((b) => b.quotes.some((q) => q.status === "PENDING_APPROVAL")),
      };
    });
  }

  async getLead(user: AuthUser, leadId: string) {
    const lead = await this.prisma.db.lead.findFirst({ where: { id: leadId, deletedAt: null }, include: leadDetailInclude });
    if (!lead) throw notFound("Lead");
    const finance = seesFinance(user);
    return {
      ...lead,
      nextStages: allowedNextStages(lead.stage).filter((s) => s !== "CONFIRMED"),
      bookings: lead.bookings.map((b) => ({
        ...b,
        verified: b.talent.reps.some((r) => r.rep.verification === "VERIFIED"),
        // P5: margin and internal costs are for finance and admins only.
        marginPaise: finance ? b.marginPaise : null,
        payoutTotalPaise: finance ? b.payoutTotalPaise : null,
        payout: b.payout && (finance ? b.payout : { ...b.payout, amountPaise: null }),
        quotes: b.quotes.map((q) => ({
          ...q,
          internalCostPaise: finance ? q.internalCostPaise : null,
          lineItems: q.lineItems.map((l) => ({ ...l, internalCostPaise: finance ? l.internalCostPaise : null })),
        })),
      })),
    };
  }

  // ---------- Lead actions ----------

  async assignOwner(user: AuthUser, leadId: string, ownerId: string) {
    this.require(user, "SALES");
    const owner = await this.prisma.db.user.findFirst({ where: { id: ownerId, disabledAt: null, roles: { hasSome: ["SALES", "SUPER_ADMIN"] } } });
    if (!owner) throw new DomainError("VALIDATION", "Pick a sales owner");
    await this.prisma.db.$transaction(async (tx) => {
      const lead = await tx.lead.update({ where: { id: leadId }, data: { ownerId } }).catch(() => {
        throw notFound("Lead");
      });
      await activity(tx, lead.id, `${owner.name} is your booking manager`, "They'll keep you posted at every step.");
      await notifyStaff(tx, owner.id, { event: "lead.assigned", subject: `New lead ${lead.ref}`, body: `${lead.ref} (${lead.eventType}, ${lead.city}) is assigned to you.`, leadId: lead.id });
      await this.audit(tx, user, "lead.assign", "Lead", lead.ref, `Owner → ${owner.name}`);
    });
  }

  async moveStage(user: AuthUser, leadId: string, to: LeadStage, reason?: string) {
    this.require(user, "SALES");
    await this.prisma.db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw notFound("Lead");
      await transitionLead(tx, leadId, to, { reason, completionNote: reason, actorId: user.id });
      await this.audit(tx, user, "lead.transition", "Lead", lead.ref, `${lead.stage} → ${to}${reason ? ` (${reason})` : ""}`);
    });
  }

  async addTalent(user: AuthUser, leadId: string, slug: string) {
    this.require(user, "SALES", "TALENT_MANAGER");
    await this.prisma.db.$transaction(async (tx) => {
      const [lead, talent] = await Promise.all([tx.lead.findUnique({ where: { id: leadId } }), tx.talent.findUnique({ where: { slug } })]);
      if (!lead) throw notFound("Lead");
      if (!talent) throw notFound("Talent");
      if (talent.status !== "PUBLISHED") throw new DomainError("NOT_BOOKABLE", `${talent.stageName} isn't live yet — publish the profile first`, 409);
      const existing = await tx.booking.findUnique({ where: { leadId_talentId: { leadId, talentId: talent.id } } });
      if (existing) throw new DomainError("DUPLICATE", "Already on this lead", 409);
      await assertDateOpen(tx, [talent.id], lead.eventDate);
      await tx.booking.create({ data: { leadId, talentId: talent.id } });
      await activity(tx, leadId, `${talent.stageName} added to your shortlist`, "We'll check their availability for your date.");
      await this.audit(tx, user, "lead.addTalent", "Lead", lead.ref, talent.stageName);
    });
  }

  async addNote(user: AuthUser, leadId: string, text: string) {
    await this.prisma.db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw notFound("Lead");
      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      await activity(tx, leadId, `Note from ${actor.name}`, text, true, user.id);
      await this.audit(tx, user, "lead.note", "Lead", lead.ref, "Internal note added");
    });
  }

  // ---------- Booking actions ----------

  async bookingAction(user: AuthUser, bookingId: string, action: BookingAction, note?: string) {
    this.require(user, ...BOOKING_ACTIONS[action]);
    await this.prisma.db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { lead: true, talent: true, quotes: true, contracts: true, payout: true, milestones: true } });
      if (!booking) throw notFound("Booking");
      const name = booking.talent.stageName;
      const leadId = booking.leadId;
      const open = !booking.cancelledAt;
      const invalid = (message: string) => new DomainError("INVALID", message, 409);

      switch (action) {
        case "startAvailabilityCheck": {
          if (!open) throw invalid("This booking is cancelled");
          if (booking.availability !== "NOT_CHECKED") throw invalid("Availability check already started");
          if (!booking.lead.ownerId) {
            await tx.lead.update({ where: { id: leadId }, data: { ownerId: user.id } });
          }
          const path: LeadStage[] = ["NEW", "CONTACTED", "REQUIREMENT_RECEIVED", "SHORTLISTED", "AVAILABILITY_CHECK"];
          const start = path.indexOf(booking.lead.stage);
          if (start !== -1) for (const stage of path.slice(start + 1)) await transitionLead(tx, leadId, stage, { actorId: user.id });
          await tx.booking.update({ where: { id: bookingId }, data: { availability: "AWAITING_MANAGER" } });
          await activity(tx, leadId, `Checking ${name}'s availability`, "We've asked the artist's representative to confirm the date.");
          break;
        }
        case "markAvailable":
        case "markTentative":
        case "markUnavailable": {
          if (!open) throw invalid("This booking is cancelled");
          if (!["AWAITING_MANAGER", "HOLD_REQUESTED", "AVAILABLE", "TENTATIVE"].includes(booking.availability)) throw invalid("Start the availability check first");
          if (action === "markUnavailable" && booking.quotes.some((q) => q.status === "ACCEPTED")) throw invalid("A quote is already accepted — cancel the booking instead");
          const next = action === "markAvailable" ? "AVAILABLE" : action === "markTentative" ? "TENTATIVE" : "UNAVAILABLE";
          await tx.booking.update({ where: { id: bookingId }, data: { availability: next } });
          const copy = {
            AVAILABLE: [`${name} is available`, "Your quote is being prepared."],
            TENTATIVE: [`${name} is tentatively available`, "The date is pencilled in; we'll firm it up with the quote."],
            UNAVAILABLE: [`${name} is not available on your date`, "Your manager will suggest similar artists."],
          } as const;
          await activity(tx, leadId, copy[next][0], copy[next][1]);
          break;
        }
        case "recordRepAcceptance": {
          if (!open) throw invalid("This booking is cancelled");
          if (booking.availability !== "AVAILABLE" && booking.availability !== "TENTATIVE") throw invalid("The artist must be available first");
          if (booking.repAcceptedAt) throw invalid("Already recorded");
          await tx.booking.update({ where: { id: bookingId }, data: { repAcceptedAt: new Date() } });
          await activity(tx, leadId, `${name}'s team accepted the booking terms`);
          await evaluateConfirmation(tx, bookingId);
          break;
        }
        case "sendContract": {
          if (!open) throw invalid("This booking is cancelled");
          if (!booking.quotes.some((q) => q.status === "ACCEPTED")) throw invalid("The customer must accept a quote first");
          if (booking.contracts.length > 0) throw invalid("Contract already sent");
          await tx.contract.create({ data: { bookingId, status: "SENT", sentAt: new Date() } });
          await activity(tx, leadId, `Contract sent for ${name}`, "Review and sign it online.");
          await notifyCustomer(tx, leadId, { event: "contract.sent", subject: "Your contract is ready to sign", body: `The contract for ${name} is ready. Sign it from your booking page.` });
          break;
        }
        case "completeEvent": {
          if (booking.availability !== "CONFIRMED") throw invalid("Only confirmed bookings can be completed");
          if (booking.completedAt) throw invalid("Already marked complete");
          const completionNote = note?.trim();
          if (!completionNote) throw new DomainError("VALIDATION", "Add a completion note");
          await tx.booking.update({ where: { id: bookingId }, data: { completedAt: new Date(), completionNote } });
          if (booking.lead.stage === "CONFIRMED") await transitionLead(tx, leadId, "EVENT_COMPLETED", { completionNote, actorId: user.id });
          // SET-1: payout record equals the contracted payout.
          await tx.payout.create({ data: { bookingId, amountPaise: booking.payoutTotalPaise ?? 0n } });
          await activity(tx, leadId, "Event completed", "Thank you for booking with us. We'd love your feedback.");
          break;
        }
        case "markPayoutPaid": {
          if (!booking.payout) throw invalid("There's no payout yet — complete the event first");
          if (booking.payout.status === "PAID") throw invalid("Already paid");
          await tx.payout.update({ where: { bookingId }, data: { status: "PAID", paidAt: new Date(), reference: note?.trim() || null } });
          await activity(tx, leadId, `Payout to ${name} marked paid`, null, true, user.id);
          const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, include: { bookings: { include: { milestones: true, payout: true } } } });
          if (lead.stage === "EVENT_COMPLETED") await transitionLead(tx, leadId, "SETTLEMENT", { actorId: user.id });
          const allPaid = lead.bookings.every((b) => b.milestones.every((m) => m.status === "PAID" || m.status === "CANCELLED"));
          const allPayouts = lead.bookings.every((b) => b.cancelledAt || b.id === bookingId || b.payout?.status === "PAID");
          if (allPaid && allPayouts) {
            const fresh = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
            if (fresh.stage === "SETTLEMENT") await transitionLead(tx, leadId, "CLOSED", { actorId: user.id });
          }
          break;
        }
        case "cancelBooking": {
          if (!open) throw invalid("Already cancelled");
          if (booking.completedAt) throw invalid("Completed bookings can't be cancelled");
          const reason = note?.trim();
          if (!reason) throw new DomainError("VALIDATION", "A cancellation reason is required");
          await tx.booking.update({ where: { id: bookingId }, data: { cancelledAt: new Date(), cancelReason: reason } });
          await releaseDate(tx, bookingId);
          await tx.paymentMilestone.updateMany({ where: { bookingId, status: { notIn: ["PAID", "REFUNDED"] } }, data: { status: "CANCELLED" } });
          const live = await tx.booking.count({ where: { leadId, cancelledAt: null } });
          if (live === 0 && (booking.lead.stage === "ADVANCE_PENDING" || booking.lead.stage === "CONFIRMED")) {
            await transitionLead(tx, leadId, "CANCELLED", { reason, actorId: user.id });
          }
          await activity(tx, leadId, `${name} booking cancelled`, `${reason} Any refund follows the cancellation policy.`);
          break;
        }
      }
      await this.audit(tx, user, `booking.${action}`, "Booking", booking.lead.ref, `${name}${note ? ` — ${note}` : ""}`);
    });
  }

  // ---------- Quote builder (QUO-1…6) ----------

  async draftQuote(user: AuthUser, bookingId: string): Promise<QuoteDraft & { rate: QuoteRate }> {
    this.require(user, "SALES");
    const booking = await this.prisma.db.booking.findUnique({ where: { id: bookingId }, include: { lead: true, talent: { include: { rateCards: true } } } });
    if (!booking) throw notFound("Booking");
    const rate = booking.talent.rateCards[0];
    if (!rate) throw new DomainError("NO_RATE_CARD", "This artist has no rate card yet");
    const fee = rate.sellingRatePaise;
    const lines: QuoteDraftLine[] = [
      { type: "TALENT_FEE", description: `${booking.talent.stageName} — performance fee`, customerAmountPaise: String(fee), internalCostPaise: String((fee * BigInt(rate.payoutBps)) / 10_000n), taxRateBps: 1800 },
    ];
    if (booking.lead.city !== booking.talent.baseCity) {
      lines.push(
        { type: "TRAVEL", description: `Return travel from ${booking.talent.baseCity}`, customerAmountPaise: "3500000", internalCostPaise: "3200000", taxRateBps: 1800 },
        { type: "ACCOMMODATION", description: "Hotel stay (1 night)", customerAmountPaise: "1800000", internalCostPaise: "1600000", taxRateBps: 1800 },
      );
    }
    lines.push({ type: "SERVICE_FEE", description: "Booking & coordination fee", customerAmountPaise: String((fee * 750n) / 10_000n), internalCostPaise: "0", taxRateBps: 1800 });
    return {
      lines,
      validDays: 7,
      advanceBps: 5000,
      rate: { sellingRatePaise: String(rate.sellingRatePaise), minimumRatePaise: String(rate.minimumRatePaise), marginFloorBps: QUOTE_MARGIN_FLOOR_BPS },
    };
  }

  /** QUO-6: below the minimum rate or the margin floor, a super admin approves before the customer sees it. */
  async quoteChecks(talentId: string, lines: QuoteDraftLine[]) {
    const rate = await this.prisma.db.rateCard.findFirst({ where: { talentId } });
    const totals = computeQuoteTotals(lines.map((l) => ({ customerAmountPaise: BigInt(l.customerAmountPaise), taxRateBps: l.taxRateBps })));
    const cost = lines.reduce((sum, l) => sum + BigInt(l.internalCostPaise), 0n);
    const fee = lines.filter((l) => l.type === "TALENT_FEE").reduce((sum, l) => sum + BigInt(l.customerAmountPaise), 0n);
    const marginBps = totals.subtotalPaise > 0n ? Number(((totals.subtotalPaise - cost) * 10_000n) / totals.subtotalPaise) : 0;
    const reasons = [
      ...(rate && fee < rate.minimumRatePaise ? ["Artist fee is below the minimum rate"] : []),
      ...(marginBps < QUOTE_MARGIN_FLOOR_BPS ? [`Margin is below the ${QUOTE_MARGIN_FLOOR_BPS / 100}% floor`] : []),
    ];
    return { ...totals, costPaise: cost, reasons };
  }

  async createQuote(user: AuthUser, bookingId: string, draft: QuoteDraft) {
    this.require(user, "SALES");
    if (!draft.lines.some((l) => l.type === "TALENT_FEE")) throw new DomainError("VALIDATION", "Include the artist fee");
    if (draft.lines.some((l) => !GST_RATES.includes(l.taxRateBps))) throw new DomainError("VALIDATION", "Pick a valid GST rate");

    return this.prisma.db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { lead: true, talent: true, quotes: true } });
      if (!booking) throw notFound("Booking");
      if (booking.cancelledAt) throw new DomainError("INVALID", "This booking is cancelled", 409);
      if (booking.availability !== "AVAILABLE" && booking.availability !== "TENTATIVE") throw new DomainError("INVALID", "Confirm availability before quoting", 409);
      if (booking.quotes.some((q) => q.status === "ACCEPTED")) throw new DomainError("INVALID", "A quote is already accepted", 409);

      const checks = await this.quoteChecks(booking.talentId, draft.lines);
      const needsApproval = checks.reasons.length > 0;
      await tx.quote.updateMany({ where: { bookingId, status: { in: ["SENT", "PENDING_APPROVAL"] } }, data: { status: "SUPERSEDED" } });
      const version = Math.max(0, ...booking.quotes.map((q) => q.version)) + 1;
      const quote = await tx.quote.create({
        data: {
          bookingId,
          version,
          status: needsApproval ? "PENDING_APPROVAL" : "SENT",
          validUntil: new Date(Date.now() + draft.validDays * 86_400_000),
          subtotalPaise: checks.subtotalPaise,
          taxPaise: checks.taxPaise,
          totalPaise: checks.totalPaise,
          internalCostPaise: checks.costPaise,
          milestonePlan: [
            { label: "Advance", percentBps: draft.advanceBps },
            ...(draft.advanceBps < 10_000 ? [{ label: "Balance", percentBps: 10_000 - draft.advanceBps }] : []),
          ],
          lineItems: {
            create: draft.lines.map((l, position) => ({
              position,
              type: l.type,
              description: l.description.trim(),
              customerAmountPaise: BigInt(l.customerAmountPaise),
              internalCostPaise: BigInt(l.internalCostPaise),
              taxRateBps: l.taxRateBps,
            })),
          },
        },
      });
      if (!needsApproval) await this.publishQuote(tx, booking.leadId, booking.lead.stage, version, booking.talent.stageName, user.id);
      await this.audit(tx, user, "quote.create", "Quote", booking.lead.ref, `v${version} ${needsApproval ? `sent for approval — ${checks.reasons.join("; ")}` : "sent"}`);
      return { id: quote.id, status: quote.status };
    });
  }

  private async publishQuote(tx: Tx, leadId: string, stage: LeadStage, version: number, talentName: string, actorId: string) {
    if (stage === "AVAILABILITY_CHECK" || stage === "NEGOTIATION") await transitionLead(tx, leadId, "QUOTE_SENT", { actorId });
    await activity(tx, leadId, `Quote v${version} ready for ${talentName}`, "Review the itemised quote and accept it online.");
    await notifyCustomer(tx, leadId, { event: "quote.sent", subject: "Your quote is ready", body: `Your quote for ${talentName} is ready to review.` });
  }

  async approveQuote(user: AuthUser, quoteId: string) {
    this.require(user, "SUPER_ADMIN");
    await this.prisma.db.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { booking: { include: { lead: true, talent: true } } } });
      if (!quote || quote.status !== "PENDING_APPROVAL") throw new DomainError("INVALID", "Nothing to approve", 409);
      await tx.quote.update({ where: { id: quoteId }, data: { status: "SENT", approvedById: user.id } });
      await this.publishQuote(tx, quote.booking.leadId, quote.booking.lead.stage, quote.version, quote.booking.talent.stageName, user.id);
      await this.audit(tx, user, "quote.approve", "Quote", quote.booking.lead.ref, `v${quote.version} approved and sent`);
    });
  }

  async rejectQuote(user: AuthUser, quoteId: string, reason: string) {
    this.require(user, "SUPER_ADMIN");
    await this.prisma.db.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { booking: { include: { lead: true } } } });
      if (!quote || quote.status !== "PENDING_APPROVAL") throw new DomainError("INVALID", "Nothing to reject", 409);
      await tx.quote.update({ where: { id: quoteId }, data: { status: "REJECTED" } });
      await activity(tx, quote.booking.leadId, `Quote v${quote.version} rejected`, reason, true, user.id);
      await this.audit(tx, user, "quote.reject", "Quote", quote.booking.lead.ref, `v${quote.version}: ${reason}`);
    });
  }

  // ---------- Payments (PAY-1, PAY-4) ----------

  async listPayments() {
    const rows = await this.prisma.db.paymentMilestone.findMany({
      orderBy: { dueDate: "asc" },
      include: { payments: true, booking: { include: { lead: true, talent: true, contracts: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      label: m.label,
      amountPaise: m.amountPaise,
      dueDate: m.dueDate,
      status: m.status,
      isAdvance: m.isAdvance,
      paidAt: m.paidAt,
      leadId: m.booking.leadId,
      ref: m.booking.lead.ref,
      customer: m.booking.lead.contactName,
      talent: m.booking.talent.stageName,
      payment: m.payments.find((p) => p.status === "captured") ?? null,
      contractSigned: m.booking.contracts.some((c) => c.status === "SIGNED"),
    }));
  }

  async sendPaymentLink(user: AuthUser, milestoneId: string) {
    this.require(user, "ACCOUNTS", "SALES");
    await this.prisma.db.$transaction(async (tx) => {
      const m = await tx.paymentMilestone.findUnique({ where: { id: milestoneId }, include: { booking: { include: { lead: true } } } });
      if (!m) throw notFound("Milestone");
      if (m.status !== "PENDING" && m.status !== "OVERDUE") throw new DomainError("INVALID", "A link was already sent or it's paid", 409);
      await tx.paymentMilestone.update({ where: { id: milestoneId }, data: { status: "LINK_SENT" } });
      await activity(tx, m.booking.leadId, `Payment link sent: ${m.label}`, "Pay from your booking page whenever you're ready.");
      await notifyCustomer(tx, m.booking.leadId, { event: "payment.link", subject: "Payment link", body: `Your ${m.label.toLowerCase()} payment is ready. Pay from your booking page.` });
      await this.audit(tx, user, "payment.link", "Milestone", m.booking.lead.ref, `${m.label} link sent`);
    });
  }

  /** PAY-4: Accounts records a bank transfer with its UTR. */
  async recordManualPayment(user: AuthUser, milestoneId: string, reference: string) {
    this.require(user, "ACCOUNTS");
    await this.prisma.db.$transaction(async (tx) => {
      const m = await tx.paymentMilestone.findUnique({ where: { id: milestoneId }, include: { booking: { include: { lead: true } } } });
      if (!m) throw notFound("Milestone");
      if (m.status === "PAID" || m.status === "CANCELLED") throw new DomainError("INVALID", "This milestone is closed", 409);
      const clash = await tx.payment.findUnique({ where: { gatewayPaymentId: reference } });
      if (clash) throw new DomainError("DUPLICATE", "That reference is already recorded", 409);
      await tx.payment.create({ data: { milestoneId, method: "bank_transfer", gatewayPaymentId: reference, amountPaise: m.amountPaise, status: "captured", receivedAt: new Date() } });
      await tx.paymentMilestone.update({ where: { id: milestoneId }, data: { status: "PAID", paidAt: new Date() } });
      await activity(tx, m.booking.leadId, `${m.label} payment received`, `Bank transfer ref ${reference}.`);
      await notifyCustomer(tx, m.booking.leadId, { event: "payment.received", subject: "Payment received", body: `We received your ${m.label.toLowerCase()} payment. Thank you!` });
      await this.audit(tx, user, "payment.manual", "Milestone", m.booking.lead.ref, `${m.label} marked paid (UTR ${reference})`);
      await evaluateConfirmation(tx, m.bookingId);
    });
  }

  async listPayouts(user: AuthUser) {
    this.require(user, "ACCOUNTS");
    const rows = await this.prisma.db.payout.findMany({ include: { booking: { include: { lead: true, talent: { include: { reps: { include: { rep: true } } } } } } }, orderBy: { id: "asc" } });
    return rows.map((p) => ({
      ...p,
      booking: undefined,
      leadId: p.booking.leadId,
      ref: p.booking.lead.ref,
      eventDate: p.booking.lead.eventDate,
      talent: p.booking.talent.stageName,
      repName: p.booking.talent.reps[0]?.rep.name ?? "—",
    }));
  }

  // ---------- Talents ----------

  async listTalents(user: AuthUser) {
    const showRates = can(user, "SALES", "TALENT_MANAGER", "ACCOUNTS");
    const rows = await this.prisma.db.talent.findMany({
      orderBy: { stageName: "asc" },
      include: { rateCards: true, reps: { include: { rep: true } }, _count: { select: { bookings: { where: { cancelledAt: null, completedAt: null } } } } },
    });
    return rows.map((t) => ({
      slug: t.slug,
      stageName: t.stageName,
      headline: t.headline,
      baseCity: t.baseCity,
      languages: t.languages,
      tier: t.tier,
      status: t.status,
      verified: t.reps.some((r) => r.rep.verification === "VERIFIED"),
      repName: t.reps[0]?.rep.name ?? "—",
      feeBandMinPaise: t.feeBandMinPaise,
      feeBandMaxPaise: t.feeBandMaxPaise,
      openBookings: t._count.bookings,
      rateCard: showRates && t.rateCards[0]
        ? { sellingRatePaise: t.rateCards[0].sellingRatePaise, minimumRatePaise: t.rateCards[0].minimumRatePaise, payoutBps: t.rateCards[0].payoutBps }
        : null,
    }));
  }

  async blackouts(slug: string): Promise<TalentCalendar> {
    const talent = await this.prisma.db.talent.findUnique({ where: { slug }, select: { id: true, blackoutSelfEdit: true } });
    if (!talent) throw notFound("Talent");
    return calendarOf(this.prisma.db, talent);
  }

  /** AVL-4: dates set here are locked — the artist can't clear them from the portal. */
  async setBlackout(user: AuthUser, slug: string, date: string, on: boolean, note?: string) {
    this.require(user, "TALENT_MANAGER");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    if (on && date < today) throw new DomainError("VALIDATION", "Blackout dates must be in the future");
    await this.prisma.db.$transaction(async (tx) => {
      const talent = await tx.talent.findUnique({ where: { slug } });
      if (!talent) throw notFound("Talent");
      const existing = await tx.blackout.findUnique({ where: { talentId_date: { talentId: talent.id, date } }, include: { booking: { include: { lead: true } } } });
      if (existing?.booking) throw new DomainError("BOOKED", `This date is held by booking ${existing.booking.lead.ref}. Cancel that booking to free it.`, 409);
      if (on) await tx.blackout.upsert({ where: { talentId_date: { talentId: talent.id, date } }, create: { talentId: talent.id, date, locked: true, note: note || null }, update: { locked: true, note: note || null } });
      else await tx.blackout.deleteMany({ where: { talentId: talent.id, date } });
      await this.audit(tx, user, on ? "blackout.add" : "blackout.remove", "Talent", slug, note ? `${date} — ${note}` : date);
    });
  }

  // ---------- Messages & inbox ----------

  async replyToCustomer(user: AuthUser, leadId: string, body: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw notFound("Lead");
      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const message = await tx.message.create({ data: { leadId, author: "STAFF", authorId: user.id, authorName: actor.name, body } });
      if (!lead.ownerId && can(user, "SALES")) await tx.lead.update({ where: { id: leadId }, data: { ownerId: user.id } });
      await this.audit(tx, user, "message.customer", "Lead", lead.ref, "Replied to customer");
      return message;
    });
  }

  async talentThread(bookingId: string) {
    const booking = await this.prisma.db.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
    if (!booking) throw notFound("Booking");
    return this.prisma.db.message.findMany({ where: { bookingId }, orderBy: { createdAt: "asc" } });
  }

  async replyToTalent(user: AuthUser, bookingId: string, body: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { lead: true, talent: true } });
      if (!booking) throw notFound("Booking");
      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const message = await tx.message.create({ data: { bookingId, author: "STAFF", authorId: user.id, authorName: actor.name, body } });
      await this.audit(tx, user, "message.talent", "Booking", booking.lead.ref, `Replied to ${booking.talent.stageName}`);
      return message;
    });
  }

  async inbox() {
    const [contactRequests, applications, newsletter] = await Promise.all([
      this.prisma.db.contactRequest.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.db.talentApplication.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    return { contactRequests, applications, newsletter };
  }

  async setApplicationStatus(user: AuthUser, id: string, status: ApplicationStatus) {
    this.require(user, "TALENT_MANAGER");
    await this.prisma.db.$transaction(async (tx) => {
      const app = await tx.talentApplication.update({ where: { id }, data: { status } }).catch(() => {
        throw notFound("Application");
      });
      await this.audit(tx, user, "application.status", "Application", app.ref, `${app.stageName} → ${status}`);
    });
  }

  // ---------- Analytics (ANA-1, ANA-3) & audit (AUD-3) ----------

  async analytics(user: AuthUser) {
    const [leads, bookings, quotes, pendingApprovals, milestones, payouts, newApplications, contactRequests] = await Promise.all([
      this.prisma.db.lead.findMany({ select: { id: true, stage: true, createdAt: true } }),
      this.prisma.db.booking.findMany({ where: { confirmedAt: { not: null }, cancelledAt: null }, select: { leadId: true, confirmedAt: true, sellingTotalPaise: true, marginPaise: true } }),
      this.prisma.db.quote.findMany({ where: { status: { notIn: ["DRAFT", "PENDING_APPROVAL"] } }, select: { booking: { select: { leadId: true } } } }),
      this.prisma.db.quote.count({ where: { status: "PENDING_APPROVAL" } }),
      this.prisma.db.paymentMilestone.findMany({ where: { status: { notIn: ["PAID", "CANCELLED", "REFUNDED"] } }, select: { amountPaise: true } }),
      this.prisma.db.payout.findMany({ where: { status: { not: "PAID" } }, select: { amountPaise: true } }),
      this.prisma.db.talentApplication.count({ where: { status: "NEW" } }),
      this.prisma.db.contactRequest.count(),
    ]);
    const byStage = leads.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.stage]: (acc[l.stage] ?? 0) + 1 }), {});
    const quotedLeads = new Set(quotes.map((q) => q.booking.leadId));
    const confirmedLeads = new Set(bookings.map((b) => b.leadId));
    const gmv = bookings.reduce((sum, b) => sum + (b.sellingTotalPaise ?? 0n), 0n);
    const created = new Map(leads.map((l) => [l.id, l.createdAt.getTime()]));
    const days = bookings.map((b) => (b.confirmedAt!.getTime() - (created.get(b.leadId) ?? 0)) / 86_400_000).filter((d) => d >= 0);
    return {
      leadCount: leads.length,
      openLeads: leads.filter((l) => !["CLOSED", "LOST", "CANCELLED"].includes(l.stage)).length,
      byStage,
      confirmedBookings: bookings.length,
      gmvPaise: gmv,
      avgBookingPaise: bookings.length ? gmv / BigInt(bookings.length) : 0n,
      enquiryToQuoteBps: leads.length ? Math.round((quotedLeads.size / leads.length) * 10_000) : 0,
      quoteToConfirmedBps: quotedLeads.size ? Math.round((confirmedLeads.size / quotedLeads.size) * 10_000) : 0,
      avgDaysToConfirm: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      pendingApprovals,
      newApplications,
      newContactRequests: contactRequests,
      finance: seesFinance(user)
        ? {
            marginPaise: bookings.reduce((sum, b) => sum + (b.marginPaise ?? 0n), 0n),
            receivablesPaise: milestones.reduce((sum, m) => sum + m.amountPaise, 0n),
            pendingPayoutsPaise: payouts.reduce((sum, p) => sum + p.amountPaise, 0n),
          }
        : null,
    };
  }

  async auditLog(user: AuthUser) {
    this.require(user, "SUPER_ADMIN");
    return this.prisma.db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  }
}
