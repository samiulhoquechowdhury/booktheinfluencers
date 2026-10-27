import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import { DEFAULT_BRAND, buildContractPdf, buildQuotePdf, pdfFileName, type ContractPdfData, type PdfFonts, type QuotePdfData } from "@repo/pdf";
import { notFound } from "../common/errors";
import type { AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";

// Quote and contract PDFs, built on request from the database (nothing is stored). Customers get their own;
// staff get any. Never includes internal costs or margin.

const font = (name: string) => new Uint8Array(readFileSync(fileURLToPath(import.meta.resolve(`@repo/pdf/fonts/${name}`))));
let fonts: PdfFonts | null = null;
const loadFonts = () => (fonts ??= { regular: font("NotoSans-Regular.ttf"), bold: font("NotoSans-Bold.ttf") });

const leadParty = {
  select: {
    id: true,
    ref: true,
    customerId: true,
    contactName: true,
    contactEmail: true,
    companyName: true,
    gstin: true,
    eventType: true,
    eventDate: true,
    city: true,
    venue: true,
    durationMins: true,
    audienceSize: true,
    customer: { select: { phone: true, email: true } },
  },
} satisfies { select: Prisma.LeadSelect };

type LeadParty = Prisma.LeadGetPayload<typeof leadParty>;

const party = (l: LeadParty) => ({ name: l.contactName, company: l.companyName, gstin: l.gstin, email: l.contactEmail ?? l.customer.email, phone: l.customer.phone });
const event = (l: LeadParty) => ({ type: l.eventType, date: l.eventDate, city: l.city, venue: l.venue, durationMins: l.durationMins, audienceSize: l.audienceSize });
const lines = (items: { description: string; customerAmountPaise: bigint; taxRateBps: number }[]) =>
  items.map((l) => ({ description: l.description, amountPaise: l.customerAmountPaise.toString(), taxRateBps: l.taxRateBps }));

/** Quotes a customer may see; drafts and quotes waiting for internal approval stay internal. */
const CUSTOMER_QUOTE_STATUSES = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED"] as const;

@Injectable()
export class DocumentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async quote(user: AuthUser | null, quoteId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
    const q = await this.prisma.db.quote.findUnique({
      where: { id: quoteId },
      include: { lineItems: { orderBy: { position: "asc" } }, booking: { include: { talent: { select: { stageName: true, headline: true } }, lead: leadParty } } },
    });
    const lead = q?.booking.lead;
    // Customers: only their own leads, only quotes they've been sent. Same answer for "not yours" as "not there".
    if (!q || !lead || (user && (lead.customerId !== user.id || !(CUSTOMER_QUOTE_STATUSES as readonly string[]).includes(q.status)))) throw notFound("Quote");
    const plan = (q.milestonePlan as { label: string; percentBps: number }[] | null) ?? [];
    const data: QuotePdfData = {
      brand: DEFAULT_BRAND,
      ref: lead.ref,
      version: q.version,
      status: q.status,
      issuedAt: q.createdAt.toISOString(),
      validUntil: q.validUntil.toISOString(),
      customer: party(lead),
      event: event(lead),
      artist: { name: q.booking.talent.stageName, headline: q.booking.talent.headline },
      lines: lines(q.lineItems),
      totals: { subtotalPaise: q.subtotalPaise.toString(), taxPaise: q.taxPaise.toString(), totalPaise: q.totalPaise.toString() },
      schedule: plan.map((p) => ({ label: p.label, percentBps: p.percentBps })),
    };
    return { bytes: await buildQuotePdf(data, loadFonts()), fileName: pdfFileName("quote", lead.ref, q.version) };
  }

  async contract(user: AuthUser | null, contractId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
    const c = await this.prisma.db.contract.findUnique({
      where: { id: contractId },
      include: {
        booking: {
          include: {
            talent: { select: { stageName: true, headline: true, reps: { include: { rep: true } } } },
            lead: leadParty,
            quotes: { where: { status: "ACCEPTED" }, include: { lineItems: { orderBy: { position: "asc" } } }, orderBy: { version: "desc" }, take: 1 },
            milestones: { where: { status: { not: "CANCELLED" } }, orderBy: { dueDate: "asc" } },
          },
        },
      },
    });
    const lead = c?.booking.lead;
    const quote = c?.booking.quotes[0];
    if (!c || !lead || !quote || c.status === "DRAFT" || (user && lead.customerId !== user.id)) throw notFound("Contract");
    const rep = c.booking.talent.reps.find((r) => r.rep.verification === "VERIFIED")?.rep ?? c.booking.talent.reps[0]?.rep;
    const data: ContractPdfData = {
      brand: DEFAULT_BRAND,
      ref: lead.ref,
      contractId: c.id,
      status: c.status,
      sentAt: c.sentAt?.toISOString() ?? null,
      signedAt: c.signedAt?.toISOString() ?? null,
      signedName: c.signedName,
      customer: party(lead),
      event: event(lead),
      artist: { name: c.booking.talent.stageName, headline: c.booking.talent.headline, representation: rep ? (rep.agencyName ?? rep.name) : "their representative" },
      quoteVersion: quote.version,
      lines: lines(quote.lineItems),
      totals: { subtotalPaise: quote.subtotalPaise.toString(), taxPaise: quote.taxPaise.toString(), totalPaise: quote.totalPaise.toString() },
      milestones: c.booking.milestones.map((m) => ({ label: m.label, dueDate: m.dueDate.toISOString(), amountPaise: m.amountPaise.toString(), status: m.status })),
    };
    return { bytes: await buildContractPdf(data, loadFonts()), fileName: pdfFileName("contract", lead.ref) };
  }
}
