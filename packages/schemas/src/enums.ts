import { z } from "zod";

// Mirrors the Prisma enums in trd.md §4.

export const RepresentationTypeSchema = z.enum(["TALENT_MANAGED", "AGENCY_MANAGED", "PLATFORM_COORDINATED"]);
export type RepresentationType = z.infer<typeof RepresentationTypeSchema>;

export const TalentTierSchema = z.enum(["STANDARD", "PREMIUM"]);
export type TalentTier = z.infer<typeof TalentTierSchema>;

export const AvailabilityStatusSchema = z.enum([
  "NOT_CHECKED",
  "AWAITING_MANAGER",
  "HOLD_REQUESTED",
  "AVAILABLE",
  "TENTATIVE",
  "UNAVAILABLE",
  "CONFIRMED",
]);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;

export const QuoteStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "SUPERSEDED",
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const LineItemTypeSchema = z.enum([
  "TALENT_FEE",
  "TRAVEL",
  "ACCOMMODATION",
  "LOCAL_TRANSPORT",
  "SECURITY",
  "PRODUCTION",
  "SERVICE_FEE",
  "OTHER",
]);
export type LineItemType = z.infer<typeof LineItemTypeSchema>;

export const ContractStatusSchema = z.enum(["DRAFT", "SENT", "PARTIALLY_SIGNED", "SIGNED", "VOID"]);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

export const MilestoneStatusSchema = z.enum(["PENDING", "LINK_SENT", "PAID", "OVERDUE", "REFUNDED", "CANCELLED"]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const PayoutStatusSchema = z.enum(["PENDING", "SCHEDULED", "PAID", "ON_HOLD"]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;
