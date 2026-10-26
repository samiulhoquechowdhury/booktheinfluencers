import { z } from "zod";

// ENQ-1 event brief. Shared by the web form and (later) POST /v1/enquiries.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const INDIAN_MOBILE = /^[6-9]\d{9}$/;
export const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const EnquiryInputSchema = z
  .object({
    eventType: z.string().min(1, "Choose an event type"),
    eventDate: isoDate,
    altDate: isoDate.optional().or(z.literal("")),
    city: z.string().min(1, "Choose a city"),
    venue: optionalText(120),
    audienceSize: z.coerce.number().int().min(1).max(200_000).optional(),
    durationMins: z.coerce.number().int().min(15).max(24 * 60).optional(),
    budgetBand: z.string().min(1, "Choose a budget range"),
    talentSlugs: z.array(z.string()).max(5, "Pick up to five artists"),
    language: optionalText(40),
    notes: optionalText(1000),
    contactName: z.string().trim().min(2, "Enter your name").max(80),
    phone: z.string().regex(INDIAN_MOBILE, "Enter a 10-digit Indian mobile number"),
    email: z.email("Enter a valid email").optional().or(z.literal("")),
    companyName: optionalText(120),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(GSTIN, "Enter a valid 15-character GSTIN")
      .optional()
      .or(z.literal("")),
  })
  .refine((brief) => !brief.altDate || brief.altDate !== brief.eventDate, {
    path: ["altDate"],
    message: "Alternate date must differ from the event date",
  });

export type EnquiryInput = z.infer<typeof EnquiryInputSchema>;
export type EnquiryFormValues = z.input<typeof EnquiryInputSchema>;
