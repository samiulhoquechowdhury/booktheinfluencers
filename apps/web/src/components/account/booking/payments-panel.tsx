"use client";

import { useRouter } from "next/navigation";
import { CreditCard, LoaderCircle, Lock } from "lucide-react";
import type { CustomerBooking, MilestoneStatus } from "@repo/schemas";
import { formatDate } from "@repo/utils";
import { api } from "@/lib/api/client";
import { useBookingMutation } from "@/lib/api/hooks";
import { nextPayment } from "@/lib/booking-status";
import { inr } from "@/lib/format";
import { StatusPill } from "@/components/ui/status-pill";
import type { Tone } from "@/lib/booking-status";
import { Panel } from "./quote-panel";

const MILESTONE_TONES: Record<MilestoneStatus, [Tone, string]> = {
  PENDING: ["neutral", "Not paid"],
  LINK_SENT: ["action", "Awaiting payment"],
  PAID: ["success", "Paid"],
  OVERDUE: ["danger", "Overdue"],
  REFUNDED: ["neutral", "Refunded"],
  CANCELLED: ["neutral", "Cancelled"],
};

export function PaymentsPanel({ booking }: { booking: CustomerBooking }) {
  const router = useRouter();
  const payable = nextPayment(booking);
  const checkout = useBookingMutation((milestoneId: string) => api.bookings.startCheckout(milestoneId));

  return (
    <Panel icon={<CreditCard className="size-4" aria-hidden />} title="Payments">
      {booking.milestones.length === 0 ? (
        <p className="text-sm text-muted">Your payment schedule appears once you accept a quote.</p>
      ) : (
        <ul className="divide-y divide-line">
          {booking.milestones.map((milestone) => {
            const [tone, label] = MILESTONE_TONES[milestone.status];
            const canPay = payable?.id === milestone.id;
            const lockedBalance =
              !milestone.isAdvance && milestone.status !== "PAID" && milestone.status !== "CANCELLED" && booking.contract?.status !== "SIGNED";
            return (
              <li key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-display text-sm font-semibold text-ink">
                    {milestone.label} · {inr(milestone.amountPaise)}
                  </p>
                  <p className="text-xs text-muted">
                    {milestone.status === "PAID" && milestone.paidAt
                      ? `Paid ${formatDate(milestone.paidAt)}${milestone.paymentRef ? ` · ref ${milestone.paymentRef}` : ""}`
                      : `Due ${formatDate(milestone.dueDate)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={tone}>{label}</StatusPill>
                  {canPay && (
                    <button
                      type="button"
                      disabled={checkout.isPending}
                      onClick={() => checkout.mutate(milestone.id, { onSuccess: ({ checkoutUrl }) => router.push(checkoutUrl) })}
                      className="btn btn-gold btn-sm disabled:opacity-60"
                    >
                      {checkout.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
                      Pay now
                    </button>
                  )}
                  {lockedBalance && <span className="text-xs text-muted">Sign the contract first</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {booking.milestones.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Payments go through a secure gateway (UPI, cards, net banking). Your booking updates automatically once the
          gateway confirms the payment.
        </p>
      )}
    </Panel>
  );
}
