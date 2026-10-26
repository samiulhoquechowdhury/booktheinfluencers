"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarDays, ClipboardList, MapPin, Plus } from "lucide-react";
import type { CustomerLead } from "@repo/schemas";
import { formatDate, toIstDateKey } from "@repo/utils";
import { useBookings } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { customerStatus, needsCustomerAction } from "@/lib/booking-status";
import { RequireSession } from "@/components/auth/require-session";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";

export function AccountDashboard() {
  return <RequireSession role="CUSTOMER">{(session) => <Dashboard name={session.name} />}</RequireSession>;
}

function Dashboard({ name }: { name: string }) {
  const { data: leads, isPending, error, refetch } = useBookings();
  const today = toIstDateKey(new Date());

  if (isPending) return <Spinner label="Loading your bookings" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  const upcoming = leads.filter((lead) => !lead.closed && lead.eventDate >= today);
  const past = leads.filter((lead) => lead.closed || lead.eventDate < today);
  const actions = leads.flatMap((lead) =>
    lead.bookings.filter((b) => needsCustomerAction(b)).map((booking) => ({ lead, booking })),
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Hello, {name.split(" ")[0]}</h1>
          <p className="mt-1 text-muted">Track every brief, quote, contract and payment in one place.</p>
        </div>
        <Link href="/enquiry" className="btn btn-dark">
          <Plus aria-hidden />
          New brief
        </Link>
      </div>

      {actions.length > 0 && (
        <section aria-labelledby="actions-heading" className="rounded-card border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 id="actions-heading" className="flex items-center gap-2 font-display font-semibold text-amber-950">
            <BellRing className="size-5" aria-hidden />
            Needs your attention
          </h2>
          <ul className="mt-4 space-y-2">
            {actions.map(({ lead, booking }) => (
              <li key={booking.id}>
                <Link
                  href={`/account/bookings/${lead.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm transition-shadow hover:shadow-sm"
                >
                  <span>
                    <span className="font-semibold text-ink">{booking.talent.stageName}</span>
                    <span className="text-muted"> · {customerStatus(booking).hint}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-amber-800" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {leads.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-6" aria-hidden />}
          title="No bookings yet"
          body="Send us a brief for your event. We'll check availability and come back with an itemised quote."
          action={{ href: "/enquiry", label: "Send a brief" }}
        />
      ) : (
        <>
          <LeadList title="Upcoming" leads={upcoming} empty="No upcoming events." />
          {past.length > 0 && <LeadList title="Past & closed" leads={past} />}
        </>
      )}
    </div>
  );
}

function LeadList({ title, leads, empty }: { title: string; leads: CustomerLead[]; empty?: string }) {
  return (
    <section aria-label={title}>
      <h2 className="eyebrow text-muted">{title}</h2>
      {leads.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/account/bookings/${lead.id}`}
                className="block rounded-card border border-line bg-white p-5 transition-shadow hover:shadow-card sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xs font-semibold tracking-wide text-gold-deep">{lead.ref}</p>
                    <h3 className="mt-1 font-serif text-xl font-semibold text-ink">{lead.eventType}</h3>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-4" aria-hidden />
                        {formatDate(`${lead.eventDate}T12:00:00+05:30`)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-4" aria-hidden />
                        {lead.city}
                      </span>
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-ink">
                    View
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </div>

                {lead.bookings.length > 0 ? (
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {lead.bookings.map((booking) => {
                      const status = customerStatus(booking);
                      return (
                        <li key={booking.id} className="flex items-center gap-3 rounded-xl bg-cream-soft p-2.5">
                          <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-cream">
                            {booking.talent.photo && (
                              <Image src={`${booking.talent.photo}&w=88&h=88`} alt="" fill sizes="44px" className="object-cover" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-sm font-semibold text-ink">
                              {booking.talent.stageName}
                            </span>
                            <StatusPill tone={status.tone}>{status.label}</StatusPill>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-xl bg-cream-soft px-4 py-3 text-sm text-muted">
                    Our team is shortlisting artists for you.
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
