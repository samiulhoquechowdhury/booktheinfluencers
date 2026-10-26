import type { AvailabilityStatus, CustomerBooking, TalentBooking } from "@repo/schemas";

/** AVL-2 customer labels (TENTATIVE added — see docs/memory.md open question). */
export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  NOT_CHECKED: "Checking availability",
  AWAITING_MANAGER: "Awaiting manager confirmation",
  HOLD_REQUESTED: "Hold requested",
  AVAILABLE: "Available — quote coming",
  TENTATIVE: "Tentatively available",
  UNAVAILABLE: "Unavailable",
  CONFIRMED: "Confirmed",
};

export type Tone = "neutral" | "info" | "action" | "success" | "danger";

export type BookingStatus = { label: string; tone: Tone; hint: string };

/** One headline status per booking, derived from its records (the customer never sees pipeline stages). */
export function customerStatus(booking: CustomerBooking): BookingStatus {
  const openQuote = booking.quotes.find((q) => q.status === "SENT");
  const accepted = booking.quotes.find((q) => q.status === "ACCEPTED");

  if (booking.cancelledAt) return { label: "Cancelled", tone: "danger", hint: booking.cancelReason ?? "" };
  if (booking.completedAt) return { label: "Event completed", tone: "neutral", hint: "Thanks for booking with us." };
  if (booking.availability === "CONFIRMED") {
    const balanceDue = booking.milestones.some((m) => !m.isAdvance && m.status !== "PAID" && m.status !== "CANCELLED");
    return {
      label: "Confirmed",
      tone: "success",
      hint: balanceDue ? "You're all set. The balance is due before the event." : "You're all set.",
    };
  }
  if (booking.availability === "UNAVAILABLE") {
    return { label: "Unavailable", tone: "danger", hint: "Your manager will suggest similar artists." };
  }
  if (accepted) {
    return { label: "Finish booking", tone: "action", hint: "Sign the contract and pay the advance to confirm." };
  }
  if (openQuote) {
    return openQuote.changeRequest
      ? { label: "Quote under revision", tone: "info", hint: "We're working on the changes you asked for." }
      : { label: "Quote ready", tone: "action", hint: "Review and accept your quote." };
  }
  return { label: AVAILABILITY_LABELS[booking.availability], tone: "info", hint: "We'll update you as soon as we hear back." };
}

export function talentStatus(booking: TalentBooking): BookingStatus {
  if (booking.cancelledAt) return { label: "Cancelled", tone: "danger", hint: "" };
  if (booking.completedAt) {
    return booking.payoutStatus === "PAID"
      ? { label: "Paid out", tone: "neutral", hint: "Payout sent." }
      : { label: "Completed", tone: "info", hint: "Payout is being processed." };
  }
  const map: Record<AvailabilityStatus, BookingStatus> = {
    NOT_CHECKED: { label: "New request", tone: "info", hint: "" },
    AWAITING_MANAGER: { label: "Awaiting your confirmation", tone: "action", hint: "Confirm the date with our team." },
    HOLD_REQUESTED: { label: "Hold requested", tone: "action", hint: "" },
    AVAILABLE: { label: "Date accepted", tone: "info", hint: "We're finalising terms with the client." },
    TENTATIVE: { label: "Tentative", tone: "info", hint: "" },
    UNAVAILABLE: { label: "Declined", tone: "neutral", hint: "" },
    CONFIRMED: { label: "Confirmed", tone: "success", hint: "Contract signed and advance received." },
  };
  return map[booking.availability];
}

export function needsCustomerAction(booking: CustomerBooking) {
  return customerStatus(booking).tone === "action" || nextPayment(booking) !== undefined;
}

/** The next milestone the customer can pay now. Balance needs a signed contract first. */
export function nextPayment(booking: CustomerBooking) {
  if (booking.cancelledAt) return undefined;
  return booking.milestones.find(
    (m) =>
      (m.status === "PENDING" || m.status === "LINK_SENT" || m.status === "OVERDUE") &&
      (m.isAdvance || booking.contract?.status === "SIGNED"),
  );
}
