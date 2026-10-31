import type { AvailabilityStatus } from "@repo/schemas";
import type { LeadStage } from "@repo/utils";

// Plain-language guidance for the pipeline: which part of the journey a lead is in, and what to do next.
// The stage rules themselves stay in @repo/utils (stateMachine.ts).

export const PHASES: { id: string; label: string; hint: string; stages: LeadStage[] }[] = [
  { id: "enquiry", label: "New enquiries", hint: "Talk to the customer", stages: ["NEW", "CONTACTED", "REQUIREMENT_RECEIVED"] },
  { id: "artists", label: "Finding artists", hint: "Shortlist and check dates", stages: ["SHORTLISTED", "AVAILABILITY_CHECK"] },
  { id: "quote", label: "Quote and payment", hint: "Agree the price, get paid", stages: ["QUOTE_SENT", "NEGOTIATION", "ADVANCE_PENDING"] },
  { id: "confirmed", label: "Confirmed", hint: "Deliver the event", stages: ["CONFIRMED"] },
  { id: "settle", label: "After the event", hint: "Pay the artist, close it", stages: ["EVENT_COMPLETED", "SETTLEMENT"] },
];

export const FINISHED: LeadStage[] = ["CLOSED", "LOST", "CANCELLED"];

export const phaseIndex = (stage: LeadStage) => PHASES.findIndex((phase) => phase.stages.includes(stage));

export type NextStep = {
  title: string;
  detail: string;
  /** Someone else has to act first, so there's nothing for staff to do yet. */
  waiting: boolean;
  /** The work is on an artist's checklist, not the lead itself. */
  onArtist: boolean;
};

const step = (title: string, detail: string, more: Partial<Pick<NextStep, "waiting" | "onArtist">> = {}): NextStep => ({ title, detail, waiting: false, onArtist: false, ...more });

export function nextStep(lead: { stage: LeadStage; ownerName: string | null; bookings: { availability: AvailabilityStatus }[] }): NextStep | null {
  if (FINISHED.includes(lead.stage)) return null;
  if (!lead.ownerName) return step("Assign an owner", "Choose who looks after this lead.");

  const answers = lead.bookings.map((b) => b.availability);
  const anyFree = answers.some((a) => a === "AVAILABLE" || a === "TENTATIVE");

  switch (lead.stage) {
    case "NEW":
      return step("Call the customer", "Introduce yourself, then mark them as contacted.");
    case "CONTACTED":
      return step("Confirm the event details", "Check the date, city, budget and what they want.");
    case "REQUIREMENT_RECEIVED":
      return lead.bookings.length ? step("Finish the shortlist", "Add any other artists, then mark the shortlist as ready.") : step("Add artists to the shortlist", "Pick the artists who suit this event.");
    case "SHORTLISTED":
      return step("Ask if the artists are free", "Use step 1 on each artist's checklist.", { onArtist: true });
    case "AVAILABILITY_CHECK":
      if (anyFree) return step("Build and send a quote", "An artist is free. Use step 2 on their checklist.", { onArtist: true });
      if (answers.length > 0 && answers.every((a) => a === "UNAVAILABLE")) return step("Find another artist", "Nobody on the shortlist is free. Add someone else.");
      return step("Waiting for the artist's team", "Record their answer in step 1 of the checklist once you hear back.", { waiting: true, onArtist: true });
    case "QUOTE_SENT":
      return step("Waiting for the customer", "They need to accept the quote. A follow-up call can help.", { waiting: true });
    case "NEGOTIATION":
      return step("Revise the quote", "The customer asked for changes. Update it in step 2 of the checklist.", { onArtist: true });
    case "ADVANCE_PENDING":
      return step("Finish the artist's checklist", "The booking confirms itself once every step up to the advance is done.", { onArtist: true });
    case "CONFIRMED":
      return step("Deliver the event", "Mark it completed on the artist's checklist afterwards.", { onArtist: true });
    case "EVENT_COMPLETED":
      return step("Pay the artist", "Accounts marks the payout as paid on the artist's checklist.", { onArtist: true });
    case "SETTLEMENT":
      return step("Collect what's left, then close", "Close the lead once every payment is in.");
    default:
      return null;
  }
}
