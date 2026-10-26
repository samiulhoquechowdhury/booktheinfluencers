import type { AvailabilityStatus, MilestoneStatus, ProfileStatus, QuoteStatus, VerificationStatus } from "@repo/schemas";
import { formatINR, formatINRCompact, type LeadStage } from "@repo/utils";

export const inr = (paise: string | bigint) => formatINR(BigInt(paise));
export const inrCompact = (paise: string | bigint) => formatINRCompact(BigInt(paise));
export const percent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
export const istDate = (date: string) => `${date}T12:00:00+05:30`;

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  REQUIREMENT_RECEIVED: "Requirement received",
  SHORTLISTED: "Shortlisted",
  AVAILABILITY_CHECK: "Availability check",
  QUOTE_SENT: "Quote sent",
  NEGOTIATION: "Negotiation",
  ADVANCE_PENDING: "Advance pending",
  CONFIRMED: "Confirmed",
  EVENT_COMPLETED: "Event completed",
  SETTLEMENT: "Settlement",
  CLOSED: "Closed",
  LOST: "Lost",
  CANCELLED: "Cancelled",
};

/** Pipeline columns, in order (PIPE-1). Terminal stages get their own filter. */
export const PIPELINE_COLUMNS: LeadStage[] = [
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
];

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  NOT_CHECKED: "Not checked",
  AWAITING_MANAGER: "Awaiting rep",
  HOLD_REQUESTED: "Hold requested",
  AVAILABLE: "Available",
  TENTATIVE: "Tentative",
  UNAVAILABLE: "Unavailable",
  CONFIRMED: "Confirmed",
};

export const QUOTE_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Needs approval",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
};

export const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  PENDING: "Not sent",
  LINK_SENT: "Link sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export type Tone = "neutral" | "info" | "action" | "success" | "danger";

export const stageTone = (stage: LeadStage): Tone =>
  stage === "LOST" || stage === "CANCELLED"
    ? "danger"
    : stage === "CONFIRMED" || stage === "CLOSED" || stage === "EVENT_COMPLETED" || stage === "SETTLEMENT"
      ? "success"
      : stage === "QUOTE_SENT" || stage === "NEGOTIATION" || stage === "ADVANCE_PENDING"
        ? "action"
        : "info";

export const availabilityTone = (a: AvailabilityStatus): Tone =>
  a === "CONFIRMED" ? "success" : a === "UNAVAILABLE" ? "danger" : a === "AVAILABLE" || a === "TENTATIVE" ? "action" : "info";

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = { DRAFT: "Draft", PUBLISHED: "Live", HIDDEN: "Hidden" };
export const profileTone = (s: ProfileStatus): Tone => (s === "PUBLISHED" ? "success" : s === "HIDDEN" ? "danger" : "neutral");
export const verificationTone = (v: VerificationStatus): Tone => (v === "VERIFIED" ? "success" : v === "REJECTED" ? "danger" : "action");

/** Money inputs are typed in whole rupees; the API takes paise strings. */
export const toRupees = (paise: string | null | undefined) => (paise ? String(BigInt(paise) / 100n) : "");
export const toPaise = (rupees: string) => String(BigInt(rupees.replace(/\D/g, "") || "0") * 100n);
