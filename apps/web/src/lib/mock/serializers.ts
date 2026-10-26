import {
  CustomerLeadSchema,
  TalentBookingSchema,
  type CustomerLead,
  type TalentBooking,
} from "@repo/schemas";
import { TALENTS } from "@/lib/catalogue/data";
import { ACCOUNT_MANAGER } from "./internal";
import { bookingsOf, contractOf, milestonesOf, quotesOf } from "./server";
import type { BookingRec, LeadRec, MockDb } from "./types";

// Role-based serializers (rules.md §0.2). Output is parsed with the strict DTO schemas,
// so any internal field that slips in throws instead of reaching the UI.

export function toCustomerLead(db: MockDb, lead: LeadRec): CustomerLead {
  const bookings = bookingsOf(db, lead.id);
  return CustomerLeadSchema.parse({
    id: lead.id,
    ref: lead.ref,
    createdAt: lead.createdAt,
    eventType: lead.eventType,
    eventDate: lead.eventDate,
    altDate: lead.altDate,
    city: lead.city,
    venue: lead.venue,
    audienceSize: lead.audienceSize,
    durationMins: lead.durationMins,
    budgetMinPaise: lead.budgetMinPaise,
    budgetMaxPaise: lead.budgetMaxPaise,
    language: lead.language,
    notes: lead.notes,
    companyName: lead.companyName,
    gstin: lead.gstin,
    contactName: lead.contactName,
    closed: ["CLOSED", "LOST", "CANCELLED"].includes(lead.stage),
    manager: lead.ownerName ? ACCOUNT_MANAGER : null,
    bookings: bookings.map((booking) => {
      const talent = TALENTS.find((t) => t.slug === booking.talentSlug);
      const contract = contractOf(db, booking.id);
      return {
        id: booking.id,
        talent: {
          slug: booking.talentSlug,
          stageName: talent?.stageName ?? booking.talentSlug,
          headline: talent?.headline ?? "",
          photo: talent?.photo ?? "",
        },
        availability: booking.availability,
        repAccepted: Boolean(booking.repAcceptedAt),
        confirmedAt: booking.confirmedAt,
        completedAt: booking.completedAt,
        cancelledAt: booking.cancelledAt,
        cancelReason: booking.cancelReason,
        sellingTotalPaise: booking.sellingTotalPaise,
        quotes: quotesOf(db, booking.id)
          .filter((quote) => quote.status !== "DRAFT" && quote.status !== "PENDING_APPROVAL")
          .map((quote) => ({
            id: quote.id,
            version: quote.version,
            status: quote.status,
            validUntil: quote.validUntil,
            subtotalPaise: quote.subtotalPaise,
            taxPaise: quote.taxPaise,
            totalPaise: quote.totalPaise,
            lineItems: quote.lineItems.map((line) => ({
              type: line.type,
              description: line.description,
              customerAmountPaise: line.customerAmountPaise,
              taxRateBps: line.taxRateBps,
            })),
            milestonePlan: quote.milestonePlan,
            acceptedAt: quote.acceptedAt,
            changeRequest: quote.changeRequest,
          })),
        contract: contract
          ? {
              id: contract.id,
              status: contract.status,
              sentAt: contract.sentAt,
              signedAt: contract.signedAt,
              signedName: contract.signedName,
            }
          : null,
        milestones: milestonesOf(db, booking.id).map((milestone) => ({
          id: milestone.id,
          label: milestone.label,
          amountPaise: milestone.amountPaise,
          dueDate: milestone.dueDate,
          status: milestone.status,
          isAdvance: milestone.isAdvance,
          paidAt: milestone.paidAt,
          paymentRef: db.payments.find((p) => p.milestoneId === milestone.id)?.gatewayPaymentId ?? null,
        })),
      };
    }),
    timeline: db.activities
      .filter((item) => item.leadId === lead.id && !item.internal)
      .toSorted((a, b) => b.at.localeCompare(a.at))
      .map((item) => ({ at: item.at, title: item.title, body: item.body })),
  });
}

/** TAL-2: contracted payout only. Selling price, quote lines and margin are never included. */
export function toTalentBooking(db: MockDb, booking: BookingRec): TalentBooking {
  const lead = db.leads.find((l) => l.id === booking.leadId)!;
  const payout = db.payouts.find((p) => p.bookingId === booking.id);
  const accepted = quotesOf(db, booking.id).find((q) => q.status === "ACCEPTED");
  const contractedPayout =
    booking.payoutTotalPaise ?? accepted?.lineItems.find((l) => l.type === "TALENT_FEE")?.internalCostPaise ?? null;
  return TalentBookingSchema.parse({
    id: booking.id,
    ref: lead.ref,
    eventType: lead.eventType,
    eventDate: lead.eventDate,
    city: lead.city,
    venue: lead.venue,
    durationMins: lead.durationMins,
    audienceSize: lead.audienceSize,
    availability: booking.availability,
    completedAt: booking.completedAt,
    cancelledAt: booking.cancelledAt,
    payoutPaise: contractedPayout,
    payoutStatus: payout?.status ?? null,
  });
}
