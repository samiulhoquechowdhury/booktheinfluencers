import { z } from "zod";

// The website's AI assistant: the chat itself, and its Grok settings (CRM → API).

export const ASSISTANT_MODELS = ["grok-4.7", "grok-4.6", "grok-4.5", "grok-4.3"] as const;
export const DEFAULT_ASSISTANT_MODEL = ASSISTANT_MODELS[0];
export const ASSISTANT_MESSAGE_MAX = 500;
const HISTORY_MAX = 12;

/** The same words whenever a question isn't about booking talent. */
export const OFF_TOPIC_REPLY = "I can only help with finding and booking talent here. Try asking who's free on your date, or who suits your event.";

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

export type AssistantReply = {
  reply: string;
  /** Built by the server from real records, never from the model's text. */
  talents: AssistantTalent[];
  /** The date being discussed, carried into the booking link. */
  date: string | null;
  declined: boolean;
};

export type AssistantStatus = { available: boolean };

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
