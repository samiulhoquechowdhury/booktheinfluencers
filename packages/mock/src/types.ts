import type {
  AvailabilityStatus,
  ContractStatus,
  LineItemType,
  MilestoneStatus,
  PayoutStatus,
  QuoteStatus,
  HeroSlideRecord,
  LoginEventRecord,
  ReconciliationRunRecord,
  StaffRoleName,
  TalentAdminDetail,
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
  /** AVL-4: per talent slug, the dates on their calendar. */
  calendar: Record<string, CalendarRec[]>;
  /** TAL-3: artists whose calendar only the talent team can edit (absent = artist may edit). */
  calendarSelfEdit: Record<string, boolean>;
  /** Webhook idempotency (PAY-3): ids already processed. */
  processedWebhooks: string[];
  messages: MessageRec[];
  contactRequests: ContactRequestRec[];
  talentApplications: TalentApplicationRec[];
  newsletter: { email: string; at: string }[];
  /** Per user: when they last opened their notifications. */
  notificationsSeenAt: Record<string, string>;
  /** AUD-1..3: staff mutations, newest last. */
  audit: AuditRec[];
  /** ADM-1…5: talents created or edited in the admin, keyed by slug. Untouched seed talents aren't stored. */
  talentRecords: Record<string, TalentRecord>;
  /** Staff accounts managed by super admins (seeded from STAFF_USERS). */
  staffAccounts: StaffAccountRec[];
  /** Home page hero carousel and the images uploaded for it (data URLs in demo mode). */
  heroSlides: HeroSlideRec[];
  media: Record<string, string>;
  /** Payment reconciliation runs, newest first (CRM → Payments). */
  reconciliationRuns: ReconciliationRunRecord[];
  /** Sales follow-ups on leads. */
  followUps: FollowUpRec[];
  /** Sign-in history, newest first (CRM → Audit log → Sign-ins). */
  loginEvents: LoginEventRecord[];
  /** Built-in hero slides already added to this browser's store (so deleted ones don't come back). */
  heroDefaultsVersion?: number;
};

export type StaffAccountRec = {
  id: string;
  name: string;
  email: string;
  roles: StaffRoleName[];
  active: boolean;
  /** Demo only: plain text so the demo can show it. The API stores a scrypt hash. */
  password: string;
  mustChangePassword: boolean;
  mfaEnrolled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type FollowUpRec = {
  id: string;
  leadId: string;
  assigneeId: string;
  createdById: string;
  title: string;
  note: string | null;
  dueAt: string;
  doneAt: string | null;
  createdAt: string;
};

export type HeroSlideRec = Omit<HeroSlideRecord, "imageUrl"> & { imagePath: string | null };

export type TalentRecord = Omit<TalentAdminDetail, "bookingCount" | "publishBlockers"> & { createdAt: string };

/** A blocked date: set by the talent team (locked), the artist, or held by a confirmed booking. */
export type CalendarRec = { date: string; source: "manager" | "artist" | "booking"; note: string | null; bookingId: string | null };

export type AuditRec = {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
};

/** CUS-3: a thread per lead (customer ↔ manager) or per booking (talent ↔ team). */
export type MessageRec = {
  id: string;
  thread: { kind: "lead"; leadId: string } | { kind: "talent"; bookingId: string };
  author: "customer" | "talent" | "staff";
  authorName: string;
  body: string;
  at: string;
};

export type ContactRequestRec = {
  id: string;
  ref: string;
  name: string;
  phone: string;
  email: string | null;
  topic: string;
  message: string;
  at: string;
};

export type TalentApplicationRec = {
  id: string;
  ref: string;
  stageName: string;
  category: string;
  city: string;
  phone: string;
  email: string;
  representation: string;
  links: string;
  about: string;
  status: "NEW" | "REVIEWING" | "INVITED" | "DECLINED";
  at: string;
};
