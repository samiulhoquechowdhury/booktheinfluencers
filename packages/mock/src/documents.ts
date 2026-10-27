import type { ContractPdfData, QuotePdfData } from "@repo/pdf";
import { DEFAULT_BRAND } from "@repo/pdf/brand";
import { TALENTS } from "./catalogue/data";
import { ApiError } from "./server";
import { talentRecord } from "./talent-admin";
import type { LeadRec, MockDb } from "./types";

// Quote and contract PDF data from the in-browser mock, mirroring apps/api/src/documents. The demo builds the PDF
// in the browser with @repo/pdf. `customerId` limits a customer to their own documents.

const CUSTOMER_QUOTE_STATUSES = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED"];

function context(db: MockDb, bookingId: string) {
  const booking = db.bookings.find((b) => b.id === bookingId);
  const lead = booking && db.leads.find((l) => l.id === booking.leadId);
  if (!booking || !lead) return null;
  const talent = talentRecord(db, booking.talentSlug) ?? null;
  const fallback = TALENTS.find((t) => t.slug === booking.talentSlug);
  const customer = db.users.find((u) => u.id === lead.customerId);
  return { booking, lead, talent, artist: { name: talent?.stageName ?? fallback?.stageName ?? booking.talentSlug, headline: talent?.headline ?? fallback?.headline ?? "" }, customer };
}

const party = (lead: LeadRec, customer?: { phone: string; email: string | null }) => ({
  name: lead.contactName,
  company: lead.companyName,
  gstin: lead.gstin,
  email: lead.contactEmail ?? customer?.email ?? null,
  phone: customer?.phone ?? null,
});
const event = (l: LeadRec) => ({ type: l.eventType, date: l.eventDate, city: l.city, venue: l.venue, durationMins: l.durationMins, audienceSize: l.audienceSize });

export function quotePdfData(db: MockDb, quoteId: string, customerId?: string): QuotePdfData {
  const q = db.quotes.find((x) => x.id === quoteId);
  const ctx = q && context(db, q.bookingId);
  if (!q || !ctx || (customerId && (ctx.lead.customerId !== customerId || !CUSTOMER_QUOTE_STATUSES.includes(q.status)))) throw new ApiError("NOT_FOUND", "Quote not found");
  return {
    brand: DEFAULT_BRAND,
    ref: ctx.lead.ref,
    version: q.version,
    status: q.status,
    issuedAt: q.createdAt,
    validUntil: q.validUntil,
    customer: party(ctx.lead, ctx.customer),
    event: event(ctx.lead),
    artist: ctx.artist,
    lines: q.lineItems.map((l) => ({ description: l.description, amountPaise: l.customerAmountPaise, taxRateBps: l.taxRateBps })),
    totals: { subtotalPaise: q.subtotalPaise, taxPaise: q.taxPaise, totalPaise: q.totalPaise },
    schedule: q.milestonePlan,
  };
}

export function contractPdfData(db: MockDb, contractId: string, customerId?: string): ContractPdfData {
  const c = db.contracts.find((x) => x.id === contractId);
  const ctx = c && context(db, c.bookingId);
  const quote = ctx && db.quotes.filter((q) => q.bookingId === ctx.booking.id && q.status === "ACCEPTED").sort((a, b) => b.version - a.version)[0];
  if (!c || !ctx || !quote || c.status === "DRAFT" || (customerId && ctx.lead.customerId !== customerId)) throw new ApiError("NOT_FOUND", "Contract not found");
  const rep = ctx.talent?.reps.find((r) => r.verification === "VERIFIED") ?? ctx.talent?.reps[0];
  return {
    brand: DEFAULT_BRAND,
    ref: ctx.lead.ref,
    contractId: c.id,
    status: c.status,
    sentAt: c.sentAt,
    signedAt: c.signedAt,
    signedName: c.signedName,
    customer: party(ctx.lead, ctx.customer),
    event: event(ctx.lead),
    artist: { ...ctx.artist, representation: rep ? (rep.agencyName ?? rep.name) : "their representative" },
    quoteVersion: quote.version,
    lines: quote.lineItems.map((l) => ({ description: l.description, amountPaise: l.customerAmountPaise, taxRateBps: l.taxRateBps })),
    totals: { subtotalPaise: quote.subtotalPaise, taxPaise: quote.taxPaise, totalPaise: quote.totalPaise },
    milestones: db.milestones
      .filter((m) => m.bookingId === ctx.booking.id && m.status !== "CANCELLED")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((m) => ({ label: m.label, dueDate: m.dueDate, amountPaise: m.amountPaise, status: m.status })),
  };
}
