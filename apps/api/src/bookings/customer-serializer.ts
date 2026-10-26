import type { Prisma } from "@repo/db";
import { CustomerLeadSchema, type CustomerLead } from "@repo/schemas";
import { iso, paise } from "../common/validate";

// rules.md §0.2: customer DTOs are parsed with strict schemas, so an internal field
// (internal cost, payout, margin, owner, lost reason…) throws instead of leaking.

export const customerLeadInclude = {
  owner: { select: { name: true } },
  bookings: {
    orderBy: { createdAt: "asc" },
    include: {
      talent: true,
      quotes: { orderBy: { version: "desc" }, include: { lineItems: { orderBy: { position: "asc" } } } },
      contracts: true,
      milestones: { orderBy: { dueDate: "asc" }, include: { payments: true } },
    },
  },
  activities: { where: { internal: false }, orderBy: { createdAt: "desc" } },
} satisfies Prisma.LeadInclude;

export type CustomerLeadRow = Prisma.LeadGetPayload<{ include: typeof customerLeadInclude }>;

const MANAGER_PHONE = "+91 90000 12345"; // shared desk line until each manager has a number

export function toCustomerLead(lead: CustomerLeadRow): CustomerLead {
  return CustomerLeadSchema.parse({
    id: lead.id,
    ref: lead.ref,
    createdAt: lead.createdAt.toISOString(),
    eventType: lead.eventType,
    eventDate: lead.eventDate,
    altDate: lead.altDate,
    city: lead.city,
    venue: lead.venue,
    audienceSize: lead.audienceSize,
    durationMins: lead.durationMins,
    budgetMinPaise: paise(lead.budgetMinPaise),
    budgetMaxPaise: paise(lead.budgetMaxPaise),
    language: lead.language,
    notes: lead.notes,
    companyName: lead.companyName,
    gstin: lead.gstin,
    contactName: lead.contactName,
    closed: ["CLOSED", "LOST", "CANCELLED"].includes(lead.stage),
    manager: lead.owner ? { name: lead.owner.name, phone: MANAGER_PHONE } : null,
    bookings: lead.bookings.map((b) => {
      const contract = b.contracts[0];
      return {
        id: b.id,
        talent: { slug: b.talent.slug, stageName: b.talent.stageName, headline: b.talent.headline, photo: b.talent.photoUrl },
        availability: b.availability,
        repAccepted: Boolean(b.repAcceptedAt),
        confirmedAt: iso(b.confirmedAt),
        completedAt: iso(b.completedAt),
        cancelledAt: iso(b.cancelledAt),
        cancelReason: b.cancelReason,
        sellingTotalPaise: paise(b.sellingTotalPaise),
        quotes: b.quotes
          .filter((q) => q.status !== "DRAFT" && q.status !== "PENDING_APPROVAL")
          .map((q) => ({
            id: q.id,
            version: q.version,
            status: q.status,
            validUntil: q.validUntil.toISOString(),
            subtotalPaise: paise(q.subtotalPaise),
            taxPaise: paise(q.taxPaise),
            totalPaise: paise(q.totalPaise),
            lineItems: q.lineItems.map((l) => ({
              type: l.type,
              description: l.description,
              customerAmountPaise: paise(l.customerAmountPaise),
              taxRateBps: l.taxRateBps,
            })),
            milestonePlan: q.milestonePlan,
            acceptedAt: iso(q.acceptedAt),
            changeRequest: q.changeRequest,
          })),
        contract: contract
          ? { id: contract.id, status: contract.status, sentAt: iso(contract.sentAt) ?? new Date(0).toISOString(), signedAt: iso(contract.signedAt), signedName: contract.signedName }
          : null,
        milestones: b.milestones.map((m) => ({
          id: m.id,
          label: m.label,
          amountPaise: paise(m.amountPaise),
          dueDate: m.dueDate.toISOString(),
          status: m.status,
          isAdvance: m.isAdvance,
          paidAt: iso(m.paidAt),
          paymentRef: m.payments.find((p) => p.status === "captured")?.gatewayPaymentId ?? null,
        })),
      };
    }),
    timeline: lead.activities.map((a) => ({ at: a.createdAt.toISOString(), title: a.title, body: a.body })),
  });
}
