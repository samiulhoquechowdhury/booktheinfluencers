"use client";

import Link from "next/link";
import { ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { formatDateTime, formatDateWithWeekday } from "@repo/utils";
import { errorMessage } from "@/lib/api/client";
import { useTalentBooking } from "@/lib/api/hooks";
import { talentStatus } from "@/lib/booking-status";
import { durationLabel, inr } from "@/lib/format";
import { ACCOUNT_MANAGER } from "@/lib/mock/internal";
import { SUPPORT } from "@/lib/site";
import { ErrorState, Spinner } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalShell } from "./portal-shell";

const PAYOUT_LABELS = { PENDING: "Processing", SCHEDULED: "Scheduled", PAID: "Paid", ON_HOLD: "On hold" } as const;

export function PortalBookingDetail({ bookingId }: { bookingId: string }) {
  return <PortalShell>{() => <Detail bookingId={bookingId} />}</PortalShell>;
}

function Detail({ bookingId }: { bookingId: string }) {
  const { data: booking, isPending, error } = useTalentBooking(bookingId);
  if (isPending) return <Spinner />;
  if (error) return <ErrorState message={errorMessage(error)} />;
  const status = talentStatus(booking);

  const rows: [string, string | null][] = [
    ["Date", formatDateWithWeekday(`${booking.eventDate}T12:00:00+05:30`)],
    ["City", booking.city],
    ["Venue", booking.venue],
    ["Performance", durationLabel(booking.durationMins)],
    ["Audience", booking.audienceSize ? `${booking.audienceSize.toLocaleString("en-IN")} guests` : null],
    ["Completed", booking.completedAt && formatDateTime(booking.completedAt)],
  ];

  return (
    <div className="max-w-3xl">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        All bookings
      </Link>
      <div className="mt-4 rounded-card border border-line bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-xs font-semibold text-gold-deep">{booking.ref}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-ink">{booking.eventType}</h2>
          </div>
          <div className="text-right">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {status.hint && <p className="mt-1 text-xs text-muted">{status.hint}</p>}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          {rows
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
                <dd className="mt-1 text-ink">{value}</dd>
              </div>
            ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream-soft px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Your contracted payout</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-ink">
              {booking.payoutPaise ? inr(booking.payoutPaise) : "Shared once terms are agreed"}
            </p>
          </div>
          {booking.payoutStatus && (
            <StatusPill tone={booking.payoutStatus === "PAID" ? "success" : "info"}>
              Payout: {PAYOUT_LABELS[booking.payoutStatus]}
            </StatusPill>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-5 text-sm">
        <p className="text-muted">
          Questions about this booking? Talk to <span className="text-ink">{ACCOUNT_MANAGER.name}</span>.
        </p>
        <div className="flex gap-2">
          <a href={`tel:${ACCOUNT_MANAGER.phone.replace(/\s/g, "")}`} className="btn btn-outline btn-sm">
            <Phone aria-hidden />
            Call
          </a>
          <a href={`https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(`Hi, about booking ${booking.ref}`)}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            <MessageCircle aria-hidden />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
