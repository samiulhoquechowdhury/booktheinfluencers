import { z } from "zod";
import { RepresentationTypeSchema, TalentTierSchema } from "./enums";
import { PaiseStringSchema } from "./money";

// ADM-1…5: staff-only talent management. Shared by apps/api (validation) and apps/admin (forms).

export const ProfileStatusSchema = z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]);
export type ProfileStatus = z.infer<typeof ProfileStatusSchema>;

export const VerificationStatusSchema = z.enum(["PENDING", "VERIFIED", "REJECTED"]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

const HttpsUrl = z.url({ protocol: /^https$/, message: "Use an https image link" }).max(500);
const List = (max: number, item = z.string().trim().min(1).max(60)) => z.array(item).max(max);

export const TalentInputSchema = z
  .object({
    stageName: z.string().trim().min(2, "Enter the stage name").max(80),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
      .max(80)
      .optional(),
    headline: z.string().trim().min(2, "Add a one-line headline").max(120),
    bio: z.string().trim().min(20, "Write at least a couple of sentences").max(3000),
    baseCity: z.string().trim().min(2, "Enter the base city").max(60),
    travelsTo: List(10),
    languages: List(10).min(1, "Add at least one language"),
    eventTypes: List(12),
    tags: List(15, z.string().trim().toLowerCase().min(1).max(40)),
    categories: z.array(z.string()).min(1, "Pick at least one category").max(3, "Pick up to three categories"),
    tier: TalentTierSchema,
    representationType: RepresentationTypeSchema,
    featured: z.boolean().default(false),
    feeBandMinPaise: PaiseStringSchema.nullable(),
    feeBandMaxPaise: PaiseStringSchema.nullable(),
    photoUrl: HttpsUrl,
    galleryUrls: z.array(HttpsUrl).max(8, "Up to eight gallery images"),
  })
  .refine((t) => (t.feeBandMinPaise === null) === (t.feeBandMaxPaise === null), {
    path: ["feeBandMaxPaise"],
    message: "Set both ends of the fee band, or neither for “on request”",
  })
  .refine((t) => t.feeBandMinPaise === null || BigInt(t.feeBandMinPaise) <= BigInt(t.feeBandMaxPaise!), {
    path: ["feeBandMaxPaise"],
    message: "The top of the band can't be below the bottom",
  });
export type TalentInput = z.output<typeof TalentInputSchema>;

/** ADM-2: internal rate card. Never sent to customers. */
export const RateCardSchema = z
  .object({ sellingRatePaise: PaiseStringSchema, minimumRatePaise: PaiseStringSchema, payoutBps: z.number().int().min(1000, "Payout share must be at least 10%").max(10_000, "Payout share can't exceed 100%") })
  .refine((r) => BigInt(r.minimumRatePaise) <= BigInt(r.sellingRatePaise), { path: ["minimumRatePaise"], message: "Minimum can't exceed the standard rate" });
export type RateCardInput = z.output<typeof RateCardSchema>;

/** ADM-3: a representative linked to a talent; starts PENDING until KYC is checked. */
export const RepSchema = z.object({
  name: z.string().trim().min(2, "Enter the representative's name").max(80),
  agencyName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  email: z.email("Enter a valid email").optional().or(z.literal("")),
});
export type RepInput = z.output<typeof RepSchema>;

export type RepRecord = { id: string; name: string; agencyName: string | null; phone: string; email: string | null; verification: VerificationStatus };

/** What the admin talent screen reads, from either transport. */
export type TalentAdminDetail = Omit<TalentInput, "slug"> & {
  slug: string;
  status: ProfileStatus;
  rateCard: RateCardInput | null;
  reps: RepRecord[];
  bookingCount: number;
  publishBlockers: string[];
};

/** CAT-11: what stops a profile going live. */
export function publishBlockers(t: { reps: { verification: VerificationStatus }[]; photoUrl: string; categories: unknown[] }) {
  return [
    ...(t.reps.some((r) => r.verification === "VERIFIED") ? [] : ["Verify at least one representative first"]),
    ...(t.photoUrl ? [] : ["Add a profile photo"]),
    ...(t.categories.length ? [] : ["Pick a category"]),
  ];
}

// ---------- Calendar (AVL-4, TAL-3) ----------

export const BlackoutNoteSchema = z.object({ note: z.string().trim().max(120, "Keep the note under 120 characters").optional() });

/** Who put a date on the calendar: the talent team (locked), the artist, or a confirmed booking. */
export type CalendarEntry = { date: string; source: "manager" | "artist" | "booking"; note: string | null; ref: string | null; leadId: string | null };

export type TalentCalendar = {
  /** Locked dates (talent team or booking). Kept for older screens. */
  seeded: string[];
  all: string[];
  entries: CalendarEntry[];
  /** TAL-3: whether the artist may edit their own dates. */
  selfEdit: boolean;
};
