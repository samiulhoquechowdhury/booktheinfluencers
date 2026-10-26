// Lead stage transitions — trd.md §5. The API and the web mock both go through this; never set a stage directly.

export const LEAD_STAGES = [
  "NEW",
  "CONTACTED",
  "REQUIREMENT_RECEIVED",
  "SHORTLISTED",
  "AVAILABILITY_CHECK",
  "QUOTE_SENT",
  "NEGOTIATION",
  "ADVANCE_PENDING",
  "CONFIRMED",
  "EVENT_COMPLETED",
  "SETTLEMENT",
  "CLOSED",
  "LOST",
  "CANCELLED",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

const ALLOWED: Record<LeadStage, readonly LeadStage[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["REQUIREMENT_RECEIVED", "LOST"],
  REQUIREMENT_RECEIVED: ["SHORTLISTED", "LOST"],
  SHORTLISTED: ["AVAILABILITY_CHECK", "LOST"],
  AVAILABILITY_CHECK: ["QUOTE_SENT", "SHORTLISTED", "LOST"],
  QUOTE_SENT: ["NEGOTIATION", "ADVANCE_PENDING", "LOST"],
  NEGOTIATION: ["QUOTE_SENT", "ADVANCE_PENDING", "LOST"],
  ADVANCE_PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["EVENT_COMPLETED", "CANCELLED"],
  EVENT_COMPLETED: ["SETTLEMENT"],
  SETTLEMENT: ["CLOSED"],
  CLOSED: [],
  LOST: [],
  CANCELLED: [],
};

/** Facts about the lead the guards need. Callers compute these from their own records. */
export type TransitionContext = {
  actor: "staff" | "system";
  ownerSet: boolean;
  bookingCount: number;
  /** At least one booking has availability AVAILABLE or TENTATIVE. */
  anyAvailable: boolean;
  hasSentQuote: boolean;
  hasAcceptedQuote: boolean;
  /** Required for LOST and CANCELLED. */
  reason?: string;
  /** Required for EVENT_COMPLETED (OPS-4). */
  completionNote?: string;
  payoutPaid: boolean;
  allMilestonesPaid: boolean;
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function allowedNextStages(from: LeadStage): readonly LeadStage[] {
  return ALLOWED[from];
}

export function canTransition(from: LeadStage, to: LeadStage, ctx: TransitionContext): TransitionResult {
  if (!ALLOWED[from].includes(to)) return { ok: false, reason: `${from} cannot move to ${to}` };

  const guard = (pass: boolean, reason: string): TransitionResult => (pass ? { ok: true } : { ok: false, reason });

  switch (to) {
    case "CONTACTED":
      return guard(ctx.ownerSet, "Assign an owner first");
    case "SHORTLISTED":
      return from === "REQUIREMENT_RECEIVED"
        ? guard(ctx.bookingCount > 0, "Add at least one talent")
        : { ok: true };
    case "QUOTE_SENT":
      if (from === "AVAILABILITY_CHECK" && !ctx.anyAvailable) {
        return { ok: false, reason: "No talent is available or tentative yet" };
      }
      return guard(ctx.hasSentQuote, "Send a quote first");
    case "NEGOTIATION":
      return guard(ctx.hasSentQuote, "There is no sent quote to negotiate");
    case "ADVANCE_PENDING":
      return guard(ctx.hasAcceptedQuote, "The customer has not accepted a quote");
    case "CONFIRMED":
      return guard(ctx.actor === "system", "Bookings are confirmed by the system only");
    case "EVENT_COMPLETED":
      return guard(Boolean(ctx.completionNote?.trim()), "Add a completion note");
    case "CLOSED":
      return guard(ctx.payoutPaid && ctx.allMilestonesPaid, "Payout and every milestone must be paid");
    case "LOST":
    case "CANCELLED":
      return guard(Boolean(ctx.reason?.trim()), "A reason is required");
    default:
      return { ok: true };
  }
}

/** OPS-1 / AVL-3: the only way a booking becomes CONFIRMED. */
export type ConfirmationFacts = {
  quoteAccepted: boolean;
  contractSigned: boolean;
  advancePaid: boolean;
  repAccepted: boolean;
};

export function isConfirmable(facts: ConfirmationFacts): boolean {
  return facts.quoteAccepted && facts.contractSigned && facts.advancePaid && facts.repAccepted;
}
