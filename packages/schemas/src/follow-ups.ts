import { z } from "zod";

// Sales follow-ups on a lead (CRM → lead → Follow-ups). Shared by apps/api and apps/admin.

export const FollowUpInputSchema = z.object({
  title: z.string().trim().min(2, "Say what to do, e.g. Call back about the date").max(120),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  dueAt: z.iso.datetime({ offset: true, message: "Pick when it's due" }),
  /** Defaults to the lead's owner, or whoever sets it. */
  assigneeId: z.string().min(1).optional(),
});
export type FollowUpInput = z.output<typeof FollowUpInputSchema>;

export const FollowUpUpdateSchema = z
  .object({ done: z.boolean().optional(), dueAt: z.iso.datetime({ offset: true }).optional() })
  .refine((v) => v.done !== undefined || v.dueAt !== undefined, "Nothing to change");
export type FollowUpUpdate = z.output<typeof FollowUpUpdateSchema>;

export type FollowUpRecord = {
  id: string;
  leadId: string;
  leadRef: string;
  contactName: string;
  title: string;
  note: string | null;
  dueAt: string;
  doneAt: string | null;
  assigneeId: string;
  assigneeName: string;
  createdByName: string;
  createdAt: string;
};
