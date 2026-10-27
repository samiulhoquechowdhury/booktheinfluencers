"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { formatDate, formatDateTime } from "@repo/utils";
import { errorMessage } from "@/lib/api/client";
import { useBooking } from "@/lib/api/hooks";
import { inr } from "@/lib/format";
import { BRAND_NAME } from "@/lib/site";
import { RequireSession } from "@/components/auth/require-session";
import { ErrorState, Spinner } from "@/components/ui/feedback";
import { PdfButton } from "./pdf-button";
import { QuoteTable, percent } from "./quote-panel";

function Sheet({ leadId, title, pdf, children }: { leadId: string; title: string; pdf?: { kind: "quote" | "contract"; id: string }; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/account/bookings/${leadId}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to booking
        </Link>
        <div className="flex flex-wrap gap-2">
          {pdf && <PdfButton kind={pdf.kind} id={pdf.id} className="btn btn-dark btn-sm" />}
          <button type="button" onClick={() => window.print()} className={pdf ? "btn btn-outline btn-sm" : "btn btn-dark btn-sm"}>
            <Printer aria-hidden />
            {pdf ? "Print" : "Print / save as PDF"}
          </button>
        </div>
      </div>
      <article className="mx-auto max-w-3xl rounded-card border border-line bg-white p-8 sm:p-12 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="font-serif text-2xl font-semibold text-ink">{BRAND_NAME}</p>
            <p className="text-xs text-muted">Managed talent booking</p>
          </div>
          <h1 className="font-display text-xl font-semibold uppercase tracking-wider text-ink">{title}</h1>
        </header>
        {children}
      </article>
    </div>
  );
}

export function PrintableQuote({ leadId, quoteId }: { leadId: string; quoteId: string }) {
  return (
    <RequireSession role="CUSTOMER">
      {() => <QuoteSheet leadId={leadId} quoteId={quoteId} />}
    </RequireSession>
  );
}

function QuoteSheet({ leadId, quoteId }: { leadId: string; quoteId: string }) {
  const { data: lead, isPending, error } = useBooking(leadId);
  if (isPending) return <Spinner />;
  if (error) return <ErrorState message={errorMessage(error)} />;
  const booking = lead.bookings.find((b) => b.quotes.some((q) => q.id === quoteId));
  const quote = booking?.quotes.find((q) => q.id === quoteId);
  if (!booking || !quote) return <ErrorState message="We couldn't find that quote" />;

  return (
    <Sheet leadId={leadId} title={`Quote v${quote.version}`} pdf={{ kind: "quote", id: quote.id }}>
      <dl className="grid gap-4 py-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Prepared for</dt>
          <dd className="mt-1 text-ink">
            {lead.contactName}
            {lead.companyName && <>, {lead.companyName}</>}
            {lead.gstin && <span className="block text-muted">GSTIN {lead.gstin}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Reference</dt>
          <dd className="mt-1 text-ink">{lead.ref}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Event</dt>
          <dd className="mt-1 text-ink">
            {booking.talent.stageName} · {lead.eventType}, {lead.city} · {formatDate(`${lead.eventDate}T12:00:00+05:30`)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">
            {quote.status === "ACCEPTED" ? "Accepted" : "Valid until"}
          </dt>
          <dd className="mt-1 text-ink">
            {quote.status === "ACCEPTED" && quote.acceptedAt ? formatDateTime(quote.acceptedAt) : formatDate(quote.validUntil)}
          </dd>
        </div>
      </dl>
      <QuoteTable quote={quote} />
      <div className="mt-8 border-t border-line pt-5 text-sm">
        <p className="font-display font-semibold text-ink">Payment schedule</p>
        <ul className="mt-2 text-muted">
          {quote.milestonePlan.map((part) => (
            <li key={part.label}>
              {part.label}: {percent(part.percentBps)} of the total
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs leading-relaxed text-muted">
          This quote is not a confirmation. The booking is confirmed only after the quote is accepted, the contract is
          signed and the advance is received. Cancellations follow the cancellation policy in your contract.
        </p>
      </div>
    </Sheet>
  );
}

export function PrintableReceipt({ leadId, milestoneId }: { leadId: string; milestoneId: string }) {
  return (
    <RequireSession role="CUSTOMER">
      {() => <ReceiptSheet leadId={leadId} milestoneId={milestoneId} />}
    </RequireSession>
  );
}

function ReceiptSheet({ leadId, milestoneId }: { leadId: string; milestoneId: string }) {
  const { data: lead, isPending, error } = useBooking(leadId);
  if (isPending) return <Spinner />;
  if (error) return <ErrorState message={errorMessage(error)} />;
  const booking = lead.bookings.find((b) => b.milestones.some((m) => m.id === milestoneId));
  const milestone = booking?.milestones.find((m) => m.id === milestoneId);
  if (!booking || !milestone || milestone.status !== "PAID") return <ErrorState message="No receipt for this payment yet" />;

  return (
    <Sheet leadId={leadId} title="Payment receipt">
      <dl className="grid gap-5 py-6 text-sm sm:grid-cols-2">
        {[
          ["Received from", lead.contactName],
          ["Booking reference", lead.ref],
          ["For", `${milestone.label} — ${booking.talent.stageName}, ${lead.eventType}`],
          ["Paid on", milestone.paidAt ? formatDateTime(milestone.paidAt) : "—"],
          ["Payment reference", milestone.paymentRef ?? "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
            <dd className="mt-1 text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between rounded-xl bg-cream-soft px-5 py-4">
        <span className="font-display font-semibold text-ink">Amount received</span>
        <span className="font-serif text-2xl font-semibold text-ink">{inr(milestone.amountPaise)}</span>
      </div>
      <p className="mt-6 text-xs text-muted">
        This receipt confirms payment against your booking. A GST tax invoice is issued separately.
      </p>
    </Sheet>
  );
}
