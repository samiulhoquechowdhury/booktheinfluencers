import { z } from "zod";
import { RepresentationTypeSchema, TalentTierSchema } from "./enums";
import { PaiseStringSchema } from "./money";

// Public catalogue DTOs (CAT-5, CAT-7). Fee bands only — never a rate card.

export const TalentSummarySchema = z.strictObject({
  slug: z.string(),
  stageName: z.string(),
  headline: z.string(),
  categories: z.array(z.string()),
  baseCity: z.string(),
  travelsTo: z.array(z.string()),
  languages: z.array(z.string()),
  eventTypes: z.array(z.string()),
  tier: TalentTierSchema,
  representationType: RepresentationTypeSchema,
  verified: z.boolean(),
  featured: z.boolean(),
  feeBandMinPaise: PaiseStringSchema.nullable(),
  feeBandMaxPaise: PaiseStringSchema.nullable(),
  photo: z.string(),
});
export type TalentSummary = z.infer<typeof TalentSummarySchema>;

export const TalentProfileSchema = z.strictObject({
  ...TalentSummarySchema.shape,
  bio: z.string(),
  tags: z.array(z.string()),
  gallery: z.array(z.string()),
  pastEvents: z.array(z.strictObject({ title: z.string(), city: z.string(), year: z.number().int() })),
});
export type TalentProfile = z.infer<typeof TalentProfileSchema>;
