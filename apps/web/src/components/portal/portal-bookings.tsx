"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Inbox, MapPin, Wallet } from "lucide-react";
import type { TalentBooking } from "@repo/schemas";
import { formatDate, toIstDateKey } from "@repo/utils";
import { errorMessage } from "@/lib/api/client";
import { useTalentBookings } from "@/lib/api/hooks";
import { talentStatus } from "@/lib/booking-status";
import { inr } from "@/lib/format";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalShell } from "./portal-shell";

export function PortalBookings() {
  return <PortalShell>{() => <Bookings />}</PortalShell>;
}

function Bookings() {
  const { data, isPending, error, refetch } = useTalentBookings();
  if (isPending) return <Spinner label="Loading your bookings" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  const today = toIstDateKey(new Date());
  const upcoming = data.filter((b) => !b.completedAt && !b.cancelledAt && b.eventDate >= today);
  const past = data.filter((b) => !upcoming.includes(b));
  const confirmedPayout = upcoming
    .filter((b) => b.availability === "CONFIRMED" && b.payoutPaise)
    .reduce((sum, b) => sum + BigInt(b.payoutPaise!), 0n);
  const pendingPayout = data
    .filter((b) => b.completedAt && b.payoutStatus !== "PAID" && b.payoutPaise)
    .reduce((sum, b) => sum + BigInt(b.payoutPaise!), 0n);

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-6" aria-hidden />}
        title="No bookings yet"
        body="When our team checks your availability for an event, the request shows up here."
      />
    );
  }

  return (
    <div className="space-y-10">
      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat label="Upcoming bookings" value={String(upcoming.length)} />
        <Stat label="Confirmed payouts ahead" value={inr(String(confirmedPayout))} />
        <Stat label="Payout in process" value={inr(String(pendingPayout))} />
      </dl>
      <List title="Upcoming" bookings={upcoming} />
      {past.length > 0 && <List title="Past" bookings={past} />}
      <p className="text-xs text-muted">
        You see your contracted payout for each booking. Client pricing is handled by our team.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-5">
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-2 font-serif text-2xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

function List({ title, bookings }: { title: string; bookings: TalentBooking[] }) {
  if (bookings.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="eyebrow text-muted">{title}</h2>
      <ul className="mt-4 grid gap-3">
        {bookings.map((booking) => {
          const status = talentStatus(booking);
          return (
            <li key={booking.id}>
              <Link
                href={`/portal/bookings/${booking.id}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-white p-5 transition-shadow hover:shadow-card"
              >
                <div>
                  <p className="font-display text-xs font-semibold text-gold-deep">{booking.ref}</p>
                  <p className="mt-1 font-serif text-lg font-semibold text-ink">{booking.eventType}</p>
                  <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-4" aria-hidden />
                      {formatDate(`${booking.eventDate}T12:00:00+05:30`)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden />
                      {booking.city}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {booking.payoutPaise && (
                    <span className="flex items-center gap-1.5 text-sm text-ink">
                      <Wallet className="size-4 text-gold-deep" aria-hidden />
                      {inr(booking.payoutPaise)}
                    </span>
                  )}
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  <ArrowRight className="size-4 text-muted" aria-hidden />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
