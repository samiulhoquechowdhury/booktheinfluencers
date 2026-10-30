"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { CustomerBooking } from "@repo/schemas";
import { DEMO_MODE, api } from "@/lib/api/client";
import { useBookingMutation } from "@/lib/api/hooks";
import { customerStatus } from "@/lib/booking-status";
import { StatusPill } from "@/components/ui/status-pill";
import { ConfirmationChecklist } from "./confirmation-checklist";
import { ContractPanel } from "./contract-panel";
import { DemoControls } from "./demo-controls";
import { PaymentsPanel } from "./payments-panel";
import { QuotePanel } from "./quote-panel";
import { isUploaded, photoAt } from "@/lib/photo";

export function BookingCard({ leadId, booking }: { leadId: string; booking: CustomerBooking }) {
  const status = customerStatus(booking);
  const started = booking.quotes.length > 0 || booking.availability !== "NOT_CHECKED";
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useBookingMutation(({ text }: { text: string }) => api.bookings.requestCancellation(booking.id, text), {
    success: "Cancellation request sent to your manager",
  });

  return (
    <article className="rounded-card border border-line bg-white p-5 sm:p-6">
      <header className="flex flex-wrap items-center gap-4">
        <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-cream">
          {booking.talent.photo && (
            <Image src={photoAt(booking.talent.photo, 128, 128)} unoptimized={isUploaded(booking.talent.photo)} alt="" fill sizes="64px" className="object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-xl font-semibold text-ink">
            <Link href={`/talent/${booking.talent.slug}`} className="hover:text-gold-deep">
              {booking.talent.stageName}
            </Link>
          </h3>
          <p className="text-sm text-muted">{booking.talent.headline}</p>
        </div>
        <div className="text-right">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <p className="mt-1 max-w-56 text-xs text-muted">{status.hint}</p>
        </div>
      </header>

      {started && !booking.cancelledAt && (
        <div className="mt-5">
          <ConfirmationChecklist booking={booking} />
        </div>
      )}

      {booking.availability === "UNAVAILABLE" && !booking.cancelledAt && (
        <Link href={`/talent/${booking.talent.slug}#availability`} className="btn btn-outline btn-sm mt-4">
          See free dates
        </Link>
      )}

      {booking.availability !== "UNAVAILABLE" && (
        <div className="mt-5 grid gap-4">
          <QuotePanel leadId={leadId} quotes={booking.quotes} cancelled={Boolean(booking.cancelledAt)} />
          {booking.quotes.some((q) => q.status === "ACCEPTED") && (
            <>
              <ContractPanel booking={booking} />
              <PaymentsPanel booking={booking} />
            </>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {DEMO_MODE && <DemoControls booking={booking} />}

        {!booking.cancelledAt && !booking.completedAt && booking.quotes.some((q) => q.status === "ACCEPTED") && (
          <div className="text-sm">
            {!cancelling ? (
              <button type="button" onClick={() => setCancelling(true)} className="text-muted underline-offset-2 hover:text-ink hover:underline">
                Need to cancel?
              </button>
            ) : (
              <form
                className="rounded-xl border border-line p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  cancel.mutate({ text: reason }, { onSuccess: () => { setCancelling(false); setReason(""); } });
                }}
              >
                <label className="block font-medium text-ink">
                  Tell us why. Your manager will confirm any charges under the{" "}
                  <Link href="/cancellation-policy" className="underline underline-offset-2" target="_blank">
                    cancellation policy
                  </Link>{" "}
                  before anything is cancelled.
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    required
                    className="mt-2 w-full rounded-md border border-line px-3 py-2 font-normal outline-none focus:border-gold"
                  />
                </label>
                <div className="mt-3 flex gap-3">
                  <button type="submit" disabled={cancel.isPending || !reason.trim()} className="btn btn-dark btn-sm disabled:opacity-50">
                    {cancel.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                    Send request
                  </button>
                  <button type="button" onClick={() => setCancelling(false)} className="btn btn-outline btn-sm">
                    Keep booking
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
