import { FollowUpInputSchema, FollowUpUpdateSchema, type FollowUpRecord } from "@repo/schemas";
import type { StaffUser } from "./internal";
import { ApiError, activity, newId, nowIso } from "./server";
import { audit } from "./staff";
import type { FollowUpRec, MockDb } from "./types";

// Sales follow-ups for the in-browser mock. Mirrors apps/api/src/follow-ups (no worker here, so no reminders).

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!result.success) throw new ApiError("VALIDATION", result.error.issues[0]?.message ?? "Please check the form");
  return result.data;
}

function toRecord(db: MockDb, f: FollowUpRec): FollowUpRecord {
  const lead = db.leads.find((l) => l.id === f.leadId);
  const name = (id: string) => db.staffAccounts.find((a) => a.id === id)?.name ?? "Unknown";
  return { ...f, leadRef: lead?.ref ?? "", contactName: lead?.contactName ?? "", assigneeName: name(f.assigneeId), createdByName: name(f.createdById) };
}

export const followUpsFor = (db: MockDb, leadId: string) =>
  db.followUps
    .filter((f) => f.leadId === leadId)
    .toSorted((a, b) => Number(Boolean(a.doneAt)) - Number(Boolean(b.doneAt)) || (a.doneAt ? (b.doneAt ?? "").localeCompare(a.doneAt) : a.dueAt.localeCompare(b.dueAt)))
    .map((f) => toRecord(db, f));

export const myFollowUps = (db: MockDb, actor: StaffUser) =>
  db.followUps.filter((f) => f.assigneeId === actor.id && !f.doneAt).toSorted((a, b) => a.dueAt.localeCompare(b.dueAt)).map((f) => toRecord(db, f));

/** Soonest open follow-up on a lead, for the pipeline badge. */
export const nextFollowUpAt = (db: MockDb, leadId: string) =>
  db.followUps.filter((f) => f.leadId === leadId && !f.doneAt).map((f) => f.dueAt).sort()[0] ?? null;

export function createFollowUp(db: MockDb, actor: StaffUser, leadId: string, raw: unknown) {
  const input = parse(FollowUpInputSchema.safeParse(raw));
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead) throw new ApiError("NOT_FOUND", "Lead not found");
  const ownerId = db.staffAccounts.find((a) => a.name === lead.ownerName)?.id;
  const assigneeId = input.assigneeId ?? ownerId ?? actor.id;
  const assignee = db.staffAccounts.find((a) => a.id === assigneeId && a.active);
  if (!assignee) throw new ApiError("VALIDATION", "Pick an active staff member");
  const f: FollowUpRec = { id: newId("fu"), leadId, assigneeId, createdById: actor.id, title: input.title, note: input.note || null, dueAt: new Date(input.dueAt).toISOString(), doneAt: null, createdAt: nowIso() };
  db.followUps.push(f);
  activity(db, leadId, `Follow-up set: ${f.title}`, `Due ${when.format(new Date(f.dueAt))} · ${assignee.name}`, true);
  audit(db, actor, "lead.followUp", "Lead", lead.ref, `Follow-up for ${assignee.name}, due ${when.format(new Date(f.dueAt))}: ${f.title}`);
  return toRecord(db, f);
}

export function updateFollowUp(db: MockDb, actor: StaffUser, id: string, raw: unknown) {
  const change = parse(FollowUpUpdateSchema.safeParse(raw));
  const f = db.followUps.find((x) => x.id === id);
  if (!f) throw new ApiError("NOT_FOUND", "Follow-up not found");
  const lead = db.leads.find((l) => l.id === f.leadId);
  if (change.done === true && !f.doneAt) {
    f.doneAt = nowIso();
    activity(db, f.leadId, `Follow-up done: ${f.title}`, actor.name, true);
  }
  if (change.done === false) f.doneAt = null;
  if (change.dueAt) f.dueAt = new Date(change.dueAt).toISOString();
  const what = change.done === true ? "done" : change.done === false ? "reopened" : `moved to ${when.format(new Date(f.dueAt))}`;
  audit(db, actor, "lead.followUp", "Lead", lead?.ref ?? f.leadId, `Follow-up ${what}: ${f.title}`);
  return toRecord(db, f);
}
