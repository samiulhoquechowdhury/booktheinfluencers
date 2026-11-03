import { z } from "zod";

// The website's AI assistant: the chat itself, and its Grok settings (CRM → API).

export const ASSISTANT_MODELS = ["grok-4.7", "grok-4.6", "grok-4.5", "grok-4.3"] as const;
export const DEFAULT_ASSISTANT_MODEL = ASSISTANT_MODELS[0];
export const ASSISTANT_MESSAGE_MAX = 500;
const HISTORY_MAX = 12;

/** The same words whenever a question isn't about booking talent. */
export const OFF_TOPIC_REPLY = "I can only help with finding and booking talent here. Try asking who's free on your date, or who suits your event.";

export const HOW_BOOKING_WORKS =
  "Tell us about your event and the artists you like. It's free and there's no commitment. Our team checks the date with each artist and sends you an itemised quote, and the date is yours once you accept, sign and pay the advance.";

/** The event types a brief can name. The enquiry form and the assistant offer the same list. */
export const EVENT_TYPES = ["Corporate event", "Wedding", "Sangeet", "College festival", "Private party", "Brand launch", "Conference", "Award night"] as const;

/** Words that mean a customer is ready to send a brief, in the simple assistant. */
export const WANTS_BOOKING = /\b(book|booking|hire|reserve|enquir\w*|inquir\w*|quote|confirm)\b/;
export const ASKS_HOW = /\bhow\b.*\b(book|booking|work|works|pay|process)\b|\bprocess\b/;
export const ON_TOPIC = /\b(hi|hello|hey|namaste|book|booking|talent|artist|artists|singer|band|dj|comedian|anchor|host|creator|event|wedding|party|sangeet|corporate|free|available|availability|date|dates|fee|price|cost|budget|quote|suggest|recommend|find|how|hire)\b/;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2026-11-03", "3 nov", "3rd november 2026" or "nov 3": the next time that date comes round. */
export function dateIn(text: string, today: string) {
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
  if (iso) return iso;
  const months = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
  const found = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${months}(?:\\s+(\\d{4}))?`).exec(text) ?? new RegExp(`\\b${months}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`).exec(text);
  if (!found) return null;
  const [day, month] = /\d/.test(found[1]!) ? [found[1]!, found[2]!] : [found[2]!, found[1]!];
  const build = (year: string | number) => `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (found[3]) return build(found[3]);
  const thisYear = Number(today.slice(0, 4));
  return build(thisYear) >= today ? build(thisYear) : build(thisYear + 1);
}

/** "Wedding" from "a singer for my wedding", for the brief the assistant starts. */
export function eventTypeIn(text: string) {
  const lower = text.toLowerCase();
  const named = (word: string) => word.length > 4 && word !== "event" && word !== "night" && new RegExp(`\\b${word}`).test(lower);
  return EVENT_TYPES.find((type) => type.toLowerCase().split(" ").some(named)) ?? null;
}

export const AssistantChatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(HISTORY_MAX)
    .refine((all) => {
      const last = all.at(-1)!;
      return last.role === "user" && last.content.length <= ASSISTANT_MESSAGE_MAX;
    }, `Keep your message under ${ASSISTANT_MESSAGE_MAX} characters`),
});
export type AssistantChatInput = z.infer<typeof AssistantChatSchema>;

export type AssistantTalent = {
  slug: string;
  name: string;
  headline: string;
  city: string;
  photo: string;
  fee: string;
  /** Only when a date was asked about. */
  status: "free" | "booked" | "unavailable" | null;
};

/** A brief the assistant has started. The customer checks and finishes it in the chat, and sends it themselves. */
export type AssistantBooking = {
  talentSlugs: string[];
  date: string | null;
  city: string | null;
  eventType: string | null;
  budgetBand: string | null;
};

export type AssistantReply = {
  reply: string;
  /** Built by the server from real records, never from the model's text. */
  talents: AssistantTalent[];
  /** The date being discussed, carried into the booking link. */
  date: string | null;
  declined: boolean;
  /** Set when the customer is ready to book: the panel offers to fill in a brief with these details. */
  booking: AssistantBooking | null;
};

/** The chat is always on the website. `ai` says whether Grok answers, or the simple built-in matching. */
export type AssistantStatus = { ai: boolean };

export type AssistantSettings = {
  configured: boolean;
  enabled: boolean;
  /** The end of the saved key, to recognise it. The key itself never leaves the server. */
  keyHint: string | null;
  model: string;
  updatedAt: string | null;
  updatedByName: string | null;
};

export const AssistantSettingsSchema = z.object({
  /** Empty keeps the saved key. */
  apiKey: z.string().trim().max(300).optional(),
  model: z.string().trim().regex(/^[a-z0-9][a-z0-9.-]{1,60}$/, "Enter a model name, like grok-4.7"),
  enabled: z.boolean(),
});
export type AssistantSettingsInput = z.infer<typeof AssistantSettingsSchema>;
