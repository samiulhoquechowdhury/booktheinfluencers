import { z } from "zod";
import {
  AvailabilityStatusSchema,
  ContractStatusSchema,
  LineItemTypeSchema,
  MilestoneStatusSchema,
  PayoutStatusSchema,
  QuoteStatusSchema,
} from "./enums";
import { PaiseStringSchema } from "./money";

// Role-specific booking DTOs. Strict objects: a leaked internal field fails parsing (rules.md §0.2).

const isoDateTime = z.string();
const nullableDateTime = isoDateTime.nullable();

export const CustomerQuoteSchema = z.strictObject({
  id: z.string(),
  version: z.number().int(),
  status: QuoteStatusSchema,
  validUntil: isoDateTime,
  subtotalPaise: PaiseStringSchema,
  taxPaise: PaiseStringSchema,
  totalPaise: PaiseStringSchema,
  lineItems: z.array(
    z.strictObject({
      type: LineItemTypeSchema,
      description: z.string(),
      customerAmountPaise: PaiseStringSchema,
      taxRateBps: z.number().int(),
    }),
  ),
  milestonePlan: z.array(z.strictObject({ label: z.string(), percentBps: z.number().int() })),
  acceptedAt: nullableDateTime,
  changeRequest: z.string().nullable(),
});
export type CustomerQuote = z.infer<typeof CustomerQuoteSchema>;

export const CustomerContractSchema = z.strictObject({
  id: z.string(),
  status: ContractStatusSchema,
  sentAt: isoDateTime,
  signedAt: nullableDateTime,
  signedName: z.string().nullable(),
});
export type CustomerContract = z.infer<typeof CustomerContractSchema>;

export const CustomerMilestoneSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  amountPaise: PaiseStringSchema,
  dueDate: isoDateTime,
  status: MilestoneStatusSchema,
  isAdvance: z.boolean(),
  paidAt: nullableDateTime,
  paymentRef: z.string().nullable(),
});
export type CustomerMilestone = z.infer<typeof CustomerMilestoneSchema>;

export const CustomerBookingSchema = z.strictObject({
  id: z.string(),
  talent: z.strictObject({ slug: z.string(), stageName: z.string(), headline: z.string(), photo: z.string() }),
  availability: AvailabilityStatusSchema,
  repAccepted: z.boolean(),
  confirmedAt: nullableDateTime,
  completedAt: nullableDateTime,
  cancelledAt: nullableDateTime,
  cancelReason: z.string().nullable(),
  sellingTotalPaise: PaiseStringSchema.nullable(),
  quotes: z.array(CustomerQuoteSchema),
  contract: CustomerContractSchema.nullable(),
  milestones: z.array(CustomerMilestoneSchema),
});
export type CustomerBooking = z.infer<typeof CustomerBookingSchema>;

export const CustomerLeadSchema = z.strictObject({
  id: z.string(),
  ref: z.string(),
  createdAt: isoDateTime,
  eventType: z.string(),
  eventDate: z.string(),
  altDate: z.string().nullable(),
  city: z.string(),
  venue: z.string().nullable(),
  audienceSize: z.number().int().nullable(),
  durationMins: z.number().int().nullable(),
  budgetMinPaise: PaiseStringSchema.nullable(),
  budgetMaxPaise: PaiseStringSchema.nullable(),
  language: z.string().nullable(),
  notes: z.string().nullable(),
  companyName: z.string().nullable(),
  gstin: z.string().nullable(),
  contactName: z.string(),
  closed: z.boolean(),
  manager: z.strictObject({ name: z.string(), phone: z.string() }).nullable(),
  bookings: z.array(CustomerBookingSchema),
  timeline: z.array(z.strictObject({ at: isoDateTime, title: z.string(), body: z.string().nullable() })),
});
export type CustomerLead = z.infer<typeof CustomerLeadSchema>;

/** TAL-1/TAL-2: the talent sees their contracted payout only — never selling price or margin. */
export const TalentBookingSchema = z.strictObject({
  id: z.string(),
  ref: z.string(),
  eventType: z.string(),
  eventDate: z.string(),
  city: z.string(),
  venue: z.string().nullable(),
  durationMins: z.number().int().nullable(),
  audienceSize: z.number().int().nullable(),
  availability: AvailabilityStatusSchema,
  completedAt: nullableDateTime,
  cancelledAt: nullableDateTime,
  payoutPaise: PaiseStringSchema.nullable(),
  payoutStatus: PayoutStatusSchema.nullable(),
});
export type TalentBooking = z.infer<typeof TalentBookingSchema>;
