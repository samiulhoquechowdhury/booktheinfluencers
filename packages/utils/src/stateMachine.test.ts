import { describe, expect, it } from "vitest";
import {
  LEAD_STAGES,
  allowedNextStages,
  canTransition,
  isConfirmable,
  type LeadStage,
  type TransitionContext,
} from "./stateMachine";

const ready: TransitionContext = {
  actor: "staff",
  ownerSet: true,
  bookingCount: 1,
  anyAvailable: true,
  hasSentQuote: true,
  hasAcceptedQuote: true,
  reason: "Customer chose another vendor",
  completionNote: "Show ran on time",
  payoutPaid: true,
  allMilestonesPaid: true,
};

describe("canTransition", () => {
  it("walks the happy path when every guard passes", () => {
    const path: LeadStage[] = [
      "NEW",
      "CONTACTED",
      "REQUIREMENT_RECEIVED",
      "SHORTLISTED",
      "AVAILABILITY_CHECK",
      "QUOTE_SENT",
      "ADVANCE_PENDING",
    ];
    for (let i = 1; i < path.length; i++) {
      expect(canTransition(path[i - 1]!, path[i]!, ready)).toEqual({ ok: true });
    }
    expect(canTransition("ADVANCE_PENDING", "CONFIRMED", { ...ready, actor: "system" })).toEqual({ ok: true });
    expect(canTransition("CONFIRMED", "EVENT_COMPLETED", ready)).toEqual({ ok: true });
    expect(canTransition("EVENT_COMPLETED", "SETTLEMENT", ready)).toEqual({ ok: true });
    expect(canTransition("SETTLEMENT", "CLOSED", ready)).toEqual({ ok: true });
  });

  it("rejects every move not in the table", () => {
    for (const from of LEAD_STAGES) {
      for (const to of LEAD_STAGES) {
        if (allowedNextStages(from).includes(to)) continue;
        expect(canTransition(from, to, ready).ok).toBe(false);
      }
    }
  });

  it("never lets staff confirm a booking", () => {
    expect(canTransition("ADVANCE_PENDING", "CONFIRMED", ready)).toEqual({
      ok: false,
      reason: "Bookings are confirmed by the system only",
    });
  });

  it("enforces each guard", () => {
    expect(canTransition("NEW", "CONTACTED", { ...ready, ownerSet: false }).ok).toBe(false);
    expect(canTransition("REQUIREMENT_RECEIVED", "SHORTLISTED", { ...ready, bookingCount: 0 }).ok).toBe(false);
    expect(canTransition("AVAILABILITY_CHECK", "QUOTE_SENT", { ...ready, anyAvailable: false }).ok).toBe(false);
    expect(canTransition("AVAILABILITY_CHECK", "QUOTE_SENT", { ...ready, hasSentQuote: false }).ok).toBe(false);
    expect(canTransition("NEGOTIATION", "QUOTE_SENT", { ...ready, hasSentQuote: false }).ok).toBe(false);
    expect(canTransition("QUOTE_SENT", "NEGOTIATION", { ...ready, hasSentQuote: false }).ok).toBe(false);
    expect(canTransition("QUOTE_SENT", "ADVANCE_PENDING", { ...ready, hasAcceptedQuote: false }).ok).toBe(false);
    expect(canTransition("CONFIRMED", "EVENT_COMPLETED", { ...ready, completionNote: " " }).ok).toBe(false);
    expect(canTransition("SETTLEMENT", "CLOSED", { ...ready, payoutPaid: false }).ok).toBe(false);
    expect(canTransition("SETTLEMENT", "CLOSED", { ...ready, allMilestonesPaid: false }).ok).toBe(false);
  });

  it("requires a reason to lose or cancel", () => {
    expect(canTransition("QUOTE_SENT", "LOST", { ...ready, reason: undefined }).ok).toBe(false);
    expect(canTransition("CONFIRMED", "CANCELLED", { ...ready, reason: "" }).ok).toBe(false);
    expect(canTransition("CONFIRMED", "CANCELLED", ready).ok).toBe(true);
  });

  it("lets availability check go back to shortlisting without guards", () => {
    expect(canTransition("AVAILABILITY_CHECK", "SHORTLISTED", { ...ready, anyAvailable: false }).ok).toBe(true);
  });
});

describe("isConfirmable", () => {
  const all = { quoteAccepted: true, contractSigned: true, advancePaid: true, repAccepted: true };

  it("needs all four conditions", () => {
    expect(isConfirmable(all)).toBe(true);
    for (const key of Object.keys(all) as (keyof typeof all)[]) {
      expect(isConfirmable({ ...all, [key]: false })).toBe(false);
    }
  });
});
