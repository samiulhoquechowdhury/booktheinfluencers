import { z } from "zod";

// Artist self-onboarding: sign in as talent, complete the profile, upload ID, submit; a talent manager reviews it and
// the profile goes live only on approval. Shared by apps/api, apps/web, apps/admin and the demo store.

export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", host: /(^|\.)instagram\.com$/ },
  { key: "youtube", label: "YouTube", host: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { key: "facebook", label: "Facebook", host: /(^|\.)(facebook\.com|fb\.com)$/ },
  { key: "x", label: "X (Twitter)", host: /(^|\.)(x\.com|twitter\.com)$/ },
  { key: "spotify", label: "Spotify", host: /(^|\.)spotify\.com$/ },
  { key: "website", label: "Website", host: /./ },
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["key"];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export const ID_DOCUMENT_TYPES = [
  { key: "AADHAAR", label: "Aadhaar card" },
  { key: "VOTER_ID", label: "Voter ID" },
  { key: "PAN", label: "PAN card" },
  { key: "PASSPORT", label: "Passport" },
  { key: "DRIVING_LICENCE", label: "Driving licence" },
] as const;
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]["key"];
export const IdDocumentTypeSchema = z.enum(["AADHAAR", "VOTER_ID", "PAN", "PASSPORT", "DRIVING_LICENCE"]);
export const idDocumentLabel = (type: string) => ID_DOCUMENT_TYPES.find((d) => d.key === type)?.label ?? type;

export const ID_DOCUMENT_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_ID_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_GALLERY_PHOTOS = 6;

export type ReviewStatus = "INCOMPLETE" | "SUBMITTED" | "APPROVED" | "REJECTED";

const text = (max: number) => z.string().trim().max(max);
const list = (max: number) => z.array(z.string().trim().min(1).max(60)).max(max);
/** An https link, or a photo uploaded here (/v1/media/… or a data URL in demo mode). */
const Photo = z.string().max(2_000_000).refine((v) => v === "" || v.startsWith("https://") || v.startsWith("/v1/media/") || v.startsWith("data:image/"), "Upload a photo");
const Rupees = z.string().regex(/^\d{0,10}$/, "Whole rupees only");

/** Everything is optional while saving: progress is kept. Completeness is checked on submit (onboardingMissing). */
export const OnboardingProfileSchema = z
  .object({
    legalName: text(100),
    stageName: text(80),
    headline: text(120),
    bio: text(3000),
    baseCity: text(60),
    categories: z.array(z.string()).max(3, "Pick up to three categories"),
    languages: list(10),
    eventTypes: list(12),
    travelsTo: list(10),
    feeFromRupees: Rupees,
    feeToRupees: Rupees,
    photoUrl: Photo,
    galleryUrls: z.array(Photo).max(MAX_GALLERY_PHOTOS, `Up to ${MAX_GALLERY_PHOTOS} gallery photos`),
    socialLinks: z.record(z.string(), z.string().trim().max(300)),
  })
  .superRefine((v, ctx) => {
    for (const p of SOCIAL_PLATFORMS) {
      const url = v.socialLinks[p.key];
      if (!url) continue;
      const host = /^https:\/\/([^/?#:]+)/i.exec(url)?.[1]?.toLowerCase();
      if (!host || !p.host.test(host)) ctx.addIssue({ code: "custom", path: ["socialLinks", p.key], message: `Enter your full ${p.label} link, starting https://` });
    }
    if (v.feeFromRupees && v.feeToRupees && BigInt(v.feeToRupees) < BigInt(v.feeFromRupees)) ctx.addIssue({ code: "custom", path: ["feeToRupees"], message: "The top of the range can't be below the bottom" });
    if (Boolean(v.feeFromRupees) !== Boolean(v.feeToRupees)) ctx.addIssue({ code: "custom", path: ["feeToRupees"], message: "Fill both ends of the range, or leave both empty" });
  });
export type OnboardingProfile = z.output<typeof OnboardingProfileSchema>;

export type OnboardingDocument = { id: string; type: IdDocumentType; fileName: string; mime: string; size: number; uploadedAt: string };

export type OnboardingState = {
  status: ReviewStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  slug: string;
  /** True once the profile is on the public site. */
  live: boolean;
  /** True when the artist can still change their details. */
  editable: boolean;
  profile: OnboardingProfile;
  documents: OnboardingDocument[];
  /** Plain-language list of what's left before submitting. */
  missing: { step: "details" | "photos" | "social" | "documents"; field: string; label: string }[];
};

/** What must be done before an artist can submit for review. */
export function onboardingMissing(profile: OnboardingProfile, documentCount: number): OnboardingState["missing"] {
  const missing: OnboardingState["missing"] = [];
  const need = (ok: unknown, step: OnboardingState["missing"][number]["step"], field: string, label: string) => {
    if (!ok) missing.push({ step, field, label });
  };
  need(profile.legalName.length >= 2, "details", "legalName", "Your full legal name");
  need(profile.stageName.length >= 2, "details", "stageName", "Your stage name");
  need(profile.headline.length >= 2, "details", "headline", "A one-line headline");
  need(profile.bio.length >= 20, "details", "bio", "A short bio (at least a couple of sentences)");
  need(profile.baseCity.length >= 2, "details", "baseCity", "Your base city");
  need(profile.categories.length >= 1, "details", "categories", "At least one category");
  need(profile.languages.length >= 1, "details", "languages", "At least one language");
  need(profile.photoUrl, "photos", "photoUrl", "A profile photo");
  need(Object.values(profile.socialLinks).some(Boolean), "social", "socialLinks", "At least one social media link");
  need(documentCount >= 1, "documents", "documents", "At least one government ID");
  return missing;
}

/** Staff queue row. */
export type VerificationRow = {
  slug: string;
  stageName: string;
  legalName: string | null;
  phone: string | null;
  baseCity: string;
  photoUrl: string;
  status: ReviewStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  documentCount: number;
};

export type VerificationDetail = VerificationRow & {
  headline: string;
  bio: string;
  categories: string[];
  languages: string[];
  eventTypes: string[];
  travelsTo: string[];
  feeBandMinPaise: string | null;
  feeBandMaxPaise: string | null;
  galleryUrls: string[];
  socialLinks: SocialLinks;
  reviewNote: string | null;
  reviewedByName: string | null;
  email: string | null;
  documents: OnboardingDocument[];
  live: boolean;
};

export const ReviewRejectSchema = z.object({ reason: z.string().trim().min(5, "Tell the artist what to fix").max(500) });
