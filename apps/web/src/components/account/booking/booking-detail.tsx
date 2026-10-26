"use client";

import Link from "next/link";
import { ArrowLeft, FileText, MessageCircle, Phone, Receipt } from "lucide-react";
import type { CustomerLead } from "@repo/schemas";
import { formatDateTime, formatDateWithWeekday } from "@repo/utils";
import { errorMessage } from "@/lib/api/client";
import { useBooking } from "@/lib/api/hooks";
import { durationLabel, inr } from "@/lib/format";
import { SUPPORT } from "@/lib/site";
import { RequireSession } from "@/components/auth/require-session";
import { ErrorState, Spinner } from "@/components/ui/feedback";
import { BookingCard } from "./booking-card";

export function BookingDetail({ leadId }: { leadId: string }) {
  return <RequireSession role="CUSTOMER">{() => <Detail leadId={leadId} />}</RequireSession>;
}

function Detail({ leadId }: { leadId: string }) {
  const { data: lead, isPending, error, refetch } = useBooking(leadId);
  if (isPending) return <Spinner label="Loading booking" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  return (
    <div>
      <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        All bookings
      </Link>

      <header className="mt-4">
        <p className="font-display text-sm font-semibold tracking-wide text-gold-deep">{lead.ref}</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink sm:text-4xl">
          {lead.eventType} · {lead.city}
        </h1>
        <p className="mt-2 text-muted">{formatDateWithWeekday(`${lead.eventDate}T12:00:00+05:30`)}</p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {lead.bookings.length === 0 ? (
            <div className="rounded-card border border-line bg-white p-6 text-sm text-muted">
              You didn't pick specific artists, so your manager is shortlisting options that fit your brief. They'll
              appear here.
            </div>
          ) : (
            lead.bookings.map((booking) => <BookingCard key={booking.id} leadId={lead.id} booking={booking} />)
          )}
        </div>

        <aside className="space-y-5">
          <Manager lead={lead} />
          <Documents lead={lead} />
          <Brief lead={lead} />
          <Timeline lead={lead} />
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <h2 className="eyebrow text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Manager({ lead }: { lead: CustomerLead }) {
  if (!lead.manager) {
    return (
      <Card title="Your booking manager">
        <p className="text-sm text-muted">A manager will be assigned shortly and will call you to go through the brief.</p>
      </Card>
    );
  }
  const digits = lead.manager.phone.replace(/\D/g, "");
  return (
    <Card title="Your booking manager">
      <p className="font-display font-semibold text-ink">{lead.manager.name}</p>
      <p className="text-sm text-muted">{lead.manager.phone}</p>
      <div className="mt-4 flex gap-2">
        <a href={`tel:+${digits}`} className="btn btn-outline btn-sm flex-1">
          <Phone aria-hidden />
          Call
        </a>
        <a
          href={`https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(`Hi, about my booking ${lead.ref}`)}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline btn-sm flex-1"
        >
          <MessageCircle aria-hidden />
          WhatsApp
        </a>
      </div>
    </Card>
  );
}

function Documents({ lead }: { lead: CustomerLead }) {
  const docs = lead.bookings.flatMap((booking) => [
    ...booking.quotes
      .filter((q) => q.status === "ACCEPTED" || q.status === "SENT")
      .map((q) => ({
        href: `/account/bookings/${lead.id}/quote/${q.id}`,
        icon: <FileText className="size-4" aria-hidden />,
        label: `Quote v${q.version} — ${booking.talent.stageName}`,
      })),
    ...(booking.contract?.status === "SIGNED"
      ? [{ href: `/esign/${booking.contract.id}`, icon: <FileText className="size-4" aria-hidden />, label: `Signed contract — ${booking.talent.stageName}` }]
      : []),
    ...booking.milestones
      .filter((m) => m.status === "PAID")
      .map((m) => ({
        href: `/account/bookings/${lead.id}/receipt/${m.id}`,
        icon: <Receipt className="size-4" aria-hidden />,
        label: `${m.label} receipt — ${inr(m.amountPaise)}`,
      })),
  ]);

  return (
    <Card title="Documents">
      {docs.length === 0 ? (
        <p className="text-sm text-muted">Quotes, your signed contract and payment receipts will appear here.</p>
      ) : (
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li key={doc.href}>
              <Link href={doc.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-cream-soft">
                <span className="text-gold-deep">{doc.icon}</span>
                {doc.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Brief({ lead }: { lead: CustomerLead }) {
  const rows: [string, string | null][] = [
    ["Alternate date", lead.altDate && formatDateWithWeekday(`${lead.altDate}T12:00:00+05:30`)],
    ["Venue", lead.venue],
    ["Audience", lead.audienceSize ? `${lead.audienceSize.toLocaleString("en-IN")} guests` : null],
    ["Performance", durationLabel(lead.durationMins)],
    [
      "Budget",
      lead.budgetMinPaise || lead.budgetMaxPaise
        ? [lead.budgetMinPaise && inr(lead.budgetMinPaise), lead.budgetMaxPaise && inr(lead.budgetMaxPaise)].filter(Boolean).join(" – ") +
          (lead.budgetMaxPaise ? "" : "+")
        : null,
    ],
    ["Language", lead.language],
    ["Company", lead.companyName],
    ["GSTIN", lead.gstin],
    ["Notes", lead.notes],
  ];
  return (
    <Card title="Your brief">
      <dl className="space-y-2.5 text-sm">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}

function Timeline({ lead }: { lead: CustomerLead }) {
  return (
    <Card title="Timeline">
      <ol className="relative space-y-4 border-l border-line pl-5">
        {lead.timeline.map((item, index) => (
          <li key={`${item.at}-${index}`} className="relative">
            <span aria-hidden className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-gold ring-4 ring-white" />
            <p className="font-display text-sm font-semibold text-ink">{item.title}</p>
            {item.body && <p className="mt-0.5 text-sm text-muted">{item.body}</p>}
            <p className="mt-1 text-xs text-muted">{formatDateTime(item.at)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
