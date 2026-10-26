import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { EnquiryInputSchema } from "@repo/schemas";
import { DomainError, notFound } from "../common/errors";
import { parse } from "../common/validate";
import { CurrentUser, Roles, type AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { customerLeadInclude, toCustomerLead } from "./customer-serializer";
import { activity, createMilestones, evaluateConfirmation, nextRef, transitionLead } from "./domain";

const BUDGETS: Record<string, { min: bigint | null; max: bigint | null }> = {
  "under-1l": { min: null, max: 10_000_000n },
  "1l-3l": { min: 10_000_000n, max: 30_000_000n },
  "3l-5l": { min: 30_000_000n, max: 50_000_000n },
  "5l-15l": { min: 50_000_000n, max: 150_000_000n },
  "15l-plus": { min: 150_000_000n, max: null },
};

const Note = z.object({ note: z.string().trim().min(1, "Tell us what you'd like changed").max(1000) });
const Reason = z.object({ reason: z.string().trim().min(1, "Tell us why you'd like to cancel").max(1000) });

@Controller()
@Roles("CUSTOMER")
export class CustomerBookingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** ENQ-1/ENQ-2: one lead, one draft booking per selected talent, a reference straight away. */
  @Post("enquiries")
  async submit(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parse(EnquiryInputSchema, body);
    const band = BUDGETS[input.budgetBand] ?? { min: null, max: null };
    const talents = await this.prisma.db.talent.findMany({ where: { slug: { in: input.talentSlugs }, status: "PUBLISHED" } });
    if (talents.length !== new Set(input.talentSlugs).size) throw new DomainError("VALIDATION", "One of the selected artists isn't available to book");

    return this.prisma.db.$transaction(async (tx) => {
      const ref = await nextRef(tx, "lead", `TB-${new Date().getFullYear()}-`);
      const lead = await tx.lead.create({
        data: {
          ref,
          customerId: user.id,
          eventType: input.eventType,
          eventDate: input.eventDate,
          altDate: input.altDate || null,
          city: input.city,
          venue: input.venue || null,
          audienceSize: input.audienceSize ?? null,
          durationMins: input.durationMins ?? null,
          budgetMinPaise: band.min,
          budgetMaxPaise: band.max,
          language: input.language || null,
          notes: input.notes || null,
          contactName: input.contactName,
          contactEmail: input.email || null,
          companyName: input.companyName || null,
          gstin: input.gstin || null,
          bookings: { create: talents.map((t) => ({ talentId: t.id })) },
        },
      });
      await activity(tx, lead.id, "Enquiry received", `Reference ${ref}. Our team will call you to go through the brief.`);
      const account = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (account.name === "Guest" || (!account.email && input.email)) {
        await tx.user.update({ where: { id: user.id }, data: { name: account.name === "Guest" ? input.contactName : account.name, email: account.email ?? (input.email || null) } });
      }
      return { leadId: lead.id, ref };
    });
  }

  /** CUS-1 */
  @Get("me/leads")
  async list(@CurrentUser() user: AuthUser) {
    const leads = await this.prisma.db.lead.findMany({
      where: { customerId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: customerLeadInclude,
    });
    return leads.map(toCustomerLead);
  }

  /** CUS-2. Someone else's lead is a 404, not a 403 — no confirmation that it exists. */
  @Get("me/leads/:id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const lead = await this.prisma.db.lead.findFirst({ where: { id, customerId: user.id, deletedAt: null }, include: customerLeadInclude });
    if (!lead) throw notFound("Booking");
    return toCustomerLead(lead);
  }

  /** QUO-4 / QUO-7: only an open, unexpired quote; records who, when and from where. */
  @Post("quotes/:id/accept")
  @HttpCode(204)
  async accept(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    // Expiry is recorded on its own: inside the transaction below, the thrown error would roll it back.
    const expired = await this.prisma.db.quote.updateMany({
      where: { id, status: "SENT", validUntil: { lt: new Date() }, booking: { lead: { customerId: user.id } } },
      data: { status: "EXPIRED" },
    });
    if (expired.count > 0) throw new DomainError("QUOTE_EXPIRED", "This quote has expired — ask your manager for a fresh one", 409);

    await this.prisma.db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id, booking: { lead: { customerId: user.id } } }, include: { booking: { include: { lead: true, talent: true } } } });
      if (!quote) throw notFound("Quote");
      if (quote.status === "EXPIRED") throw new DomainError("QUOTE_EXPIRED", "This quote has expired — ask your manager for a fresh one", 409);
      if (quote.status !== "SENT") throw new DomainError("QUOTE_NOT_OPEN", "This quote can no longer be accepted", 409);
      await tx.quote.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: user.id } });
      await createMilestones(tx, quote, quote.booking.lead.eventDate);
      if (quote.booking.lead.stage === "QUOTE_SENT" || quote.booking.lead.stage === "NEGOTIATION") {
        await transitionLead(tx, quote.booking.leadId, "ADVANCE_PENDING", { actorId: user.id });
      }
      await activity(tx, quote.booking.leadId, `Quote v${quote.version} accepted`, `${quote.booking.talent.stageName}. Next: sign the contract and pay the advance.`);
      await evaluateConfirmation(tx, quote.bookingId);
    });
  }

  @Post("quotes/:id/request-changes")
  @HttpCode(204)
  async requestChanges(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { note } = parse(Note, body);
    await this.prisma.db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id, booking: { lead: { customerId: user.id } } }, include: { booking: { include: { lead: true } } } });
      if (!quote) throw notFound("Quote");
      if (quote.status !== "SENT") throw new DomainError("QUOTE_NOT_OPEN", "This quote is no longer open", 409);
      await tx.quote.update({ where: { id }, data: { changeRequest: note } });
      if (quote.booking.lead.stage === "QUOTE_SENT") await transitionLead(tx, quote.booking.leadId, "NEGOTIATION", { actorId: user.id });
      await activity(tx, quote.booking.leadId, `Changes requested on quote v${quote.version}`, note);
    });
  }

  /** PAY-1: hands off to the gateway. Payment state changes only from its webhook. */
  @Post("milestones/:id/checkout")
  async checkout(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const milestone = await this.prisma.db.paymentMilestone.findFirst({
      where: { id, booking: { lead: { customerId: user.id } } },
      include: { booking: { include: { contracts: true } } },
    });
    if (!milestone) throw notFound("Payment");
    if (milestone.status === "PAID") throw new DomainError("ALREADY_PAID", "This payment is already complete", 409);
    if (milestone.status === "CANCELLED") throw new DomainError("CANCELLED", "This payment was cancelled", 409);
    if (!milestone.isAdvance && !milestone.booking.contracts.some((c) => c.status === "SIGNED")) {
      throw new DomainError("CONTRACT_PENDING", "Sign the contract before paying the balance", 409);
    }
    if (milestone.status === "PENDING") await this.prisma.db.paymentMilestone.update({ where: { id }, data: { status: "LINK_SENT" } });
    // Real gateway: create an order/payment link here and return its URL.
    return { checkoutUrl: `/checkout/${milestone.id}` };
  }

  @Post("bookings/:id/cancellation-request")
  @HttpCode(204)
  async requestCancellation(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { reason } = parse(Reason, body);
    const booking = await this.prisma.db.booking.findFirst({ where: { id, lead: { customerId: user.id } }, include: { talent: true } });
    if (!booking) throw notFound("Booking");
    await activity(this.prisma.db, booking.leadId, `Cancellation requested for ${booking.talent.stageName}`, `${reason} — your manager will confirm any charges under the cancellation policy.`);
  }
}
