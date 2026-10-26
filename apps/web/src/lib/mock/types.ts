import type {
  AvailabilityStatus,
  ContractStatus,
  LineItemType,
  MilestoneStatus,
  PayoutStatus,
  QuoteStatus,
} from "@repo/schemas";
import type { LeadStage } from "@repo/utils";

// Records as the mock "database" stores them (localStorage JSON, so paise are strings).
// Fields marked INTERNAL must never reach a customer or talent DTO.

export type Paise = string;

export type UserRec = {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  roles: ("CUSTOMER" | "TALENT")[];
  talentSlug: string | null;
  createdAt: string;
};

export type LeadRec = {
  id: string;
  ref: string;
  stage: LeadStage;
  ownerName: string | null;
  customerId: string;
  eventType: string;
  eventDate: string;
  altDate: string | null;
  city: string;
  venue: string | null;
  audienceSize: number | null;
  durationMins: number | null;
  budgetMinPaise: Paise | null;
  budgetMaxPaise: Paise | null;
  language: string | null;
  notes: string | null;
  companyName: string | null;
  gstin: string | null;
  contactName: string;
  contactEmail: string | null;
  lostReason: string | null;
  createdAt: string;
};

export type BookingRec = {
  id: string;
  leadId: string;
  talentSlug: string;
  availability: AvailabilityStatus;
  repAcceptedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  sellingTotalPaise: Paise | null;
  payoutTotalPaise: Paise | null; // INTERNAL (talent sees their own)
  marginPaise: Paise | null; // INTERNAL
};

export type QuoteLineRec = {
  type: LineItemType;
  description: string;
  customerAmountPaise: Paise;
  internalCostPaise: Paise; // INTERNAL
  taxRateBps: number;
};

export type QuoteRec = {
  id: string;
  bookingId: string;
  version: number;
  status: QuoteStatus;
  validUntil: string;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  internalCostPaise: Paise; // INTERNAL
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  acceptedIp: string | null;
  changeRequest: string | null;
  lineItems: QuoteLineRec[];
  milestonePlan: { label: string; percentBps: number }[];
  createdAt: string;
};

export type ContractRec = {
  id: string;
  bookingId: string;
  status: ContractStatus;
  sentAt: string;
  signedAt: string | null;
  signedName: string | null;
  providerRef: string;
};

export type MilestoneRec = {
  id: string;
  bookingId: string;
  label: string;
  amountPaise: Paise;
  dueDate: string;
  status: MilestoneStatus;
  isAdvance: boolean;
  paidAt: string | null;
};

export type PaymentRec = {
  id: string;
  milestoneId: string;
  method: string;
  gatewayPaymentId: string;
  amountPaise: Paise;
  status: "captured" | "failed";
  receivedAt: string;
};

export type PayoutRec = {
  id: string;
  bookingId: string;
  amountPaise: Paise;
  status: PayoutStatus;
  paidAt: string | null;
};

export type ActivityRec = {
  id: string;
  leadId: string;
  at: string;
  title: string;
  body: string | null;
  /** Staff-only notes are not shown on the customer timeline. */
  internal: boolean;
};

export type MockDb = {
  version: 1;
  seq: number;
  users: UserRec[];
  leads: LeadRec[];
  bookings: BookingRec[];
  quotes: QuoteRec[];
  contracts: ContractRec[];
  milestones: MilestoneRec[];
  payments: PaymentRec[];
  payouts: PayoutRec[];
  activities: ActivityRec[];
  favourites: Record<string, string[]>;
  blackouts: Record<string, string[]>;
  /** Webhook idempotency (PAY-3): ids already processed. */
  processedWebhooks: string[];
};
