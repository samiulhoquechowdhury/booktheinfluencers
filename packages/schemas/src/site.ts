import { z } from "zod";

// Home page hero carousel, edited by super admins (apps/admin → Website).

const Href = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v.startsWith("/") || v.startsWith("#") || /^https:\/\//.test(v), "Use a page on this site (/…), a section (#…) or an https link");

export const HeroSlideInputSchema = z.object({
  eyebrow: z.string().trim().min(2, "Add a short label").max(60),
  title: z.string().trim().min(2, "Add the headline").max(60),
  accent: z.string().trim().max(60),
  body: z.string().trim().min(20, "Write a sentence or two").max(320),
  ctaLabel: z.string().trim().min(2, "Name the button").max(30),
  ctaHref: Href,
  imageAlt: z.string().trim().min(5, "Describe the photo for screen readers").max(200),
  /** An uploaded image (from POST /admin/media), or null to keep the bundled photo. */
  imageId: z.string().min(1).nullable(),
  active: z.boolean(),
});
export type HeroSlideInput = z.output<typeof HeroSlideInputSchema>;

export type HeroSlideRecord = Omit<HeroSlideInput, "imageId"> & {
  id: string;
  position: number;
  imageId: string | null;
  /** Ready to use in <img src>: an uploaded image or a bundled one; null until a photo is set. */
  imageUrl: string | null;
  updatedAt: string;
};

/** What the website renders. */
export type PublicHeroSlide = Pick<HeroSlideRecord, "id" | "eyebrow" | "title" | "accent" | "body" | "ctaLabel" | "ctaHref" | "imageAlt"> & { imageUrl: string };

export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
