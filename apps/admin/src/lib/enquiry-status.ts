import type { LeadStage } from "@repo/utils";
import type { Tone } from "./format";

// The enquiry inbox speaks in four plain statuses. The detailed stages stay underneath (stateMachine.ts).

export type EnquiryTab = "new" | "quoted" | "booked" | "closed";

export const ENQUIRY_TABS: { id: EnquiryTab; label: string; empty: string }[] = [
  { id: "new", label: "Needs a quote", empty: "No requests waiting. New ones from the website appear here." },
  { id: "quoted", label: "Quote sent", empty: "No quotes waiting on customers." },
  { id: "booked", label: "Booked", empty: "No confirmed bookings yet." },
  { id: "closed", label: "Closed", empty: "Nothing closed yet." },
];

export function enquiryStatus(lead: { stage: LeadStage; awaitingApproval: boolean }): { tab: EnquiryTab; label: string; tone: Tone } {
  switch (lead.stage) {
    case "CLOSED":
      return { tab: "closed", label: "Completed", tone: "success" };
    case "LOST":
      return { tab: "closed", label: "Not going ahead", tone: "neutral" };
    case "CANCELLED":
      return { tab: "closed", label: "Cancelled", tone: "danger" };
    case "CONFIRMED":
      return { tab: "booked", label: "Booked", tone: "success" };
    case "EVENT_COMPLETED":
    case "SETTLEMENT":
      return { tab: "booked", label: "Event done, payments open", tone: "success" };
    case "ADVANCE_PENDING":
      return { tab: "quoted", label: "Accepted, waiting for payment", tone: "action" };
    case "QUOTE_SENT":
      return { tab: "quoted", label: "Waiting for the customer", tone: "info" };
    case "NEGOTIATION":
      return { tab: "new", label: "Customer wants changes", tone: "danger" };
    default:
      return lead.awaitingApproval ? { tab: "new", label: "Quote waiting for approval", tone: "action" } : { tab: "new", label: lead.stage === "NEW" ? "New request" : "Needs a quote", tone: "danger" };
  }
}

const DAY = 86_400_000;

export function receivedAgo(iso: string, now = Date.now()) {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

/** "in 12 days", "tomorrow", "today", "3 days ago" for an event date (YYYY-MM-DD, India). */
export function untilEvent(date: string, today: string) {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
