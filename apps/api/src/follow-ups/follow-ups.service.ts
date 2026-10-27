import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import type { FollowUpInput, FollowUpRecord, FollowUpUpdate } from "@repo/schemas";
import { activity } from "../bookings/domain";
import { DomainError, notFound } from "../common/errors";
import { STAFF_ROLES, type AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";

// Sales follow-ups on leads. Any staff member can set or complete one; each shows on the lead's internal
// timeline. The worker (apps/worker follow-up-reminders) tells the assignee when one falls due.

const include = {
  lead: { select: { ref: true, contactName: true } },
  assignee: { select: { name: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.FollowUpInclude;

type Row = Prisma.FollowUpGetPayload<{ include: typeof include }>;

const toRecord = (f: Row): FollowUpRecord => ({
  id: f.id,
  leadId: f.leadId,
  leadRef: f.lead.ref,
  contactName: f.lead.contactName,
  title: f.title,
  note: f.note,
  dueAt: f.dueAt.toISOString(),
  doneAt: f.doneAt?.toISOString() ?? null,
  assigneeId: f.assigneeId,
  assigneeName: f.assignee.name,
  createdByName: f.createdBy.name,
  createdAt: f.createdAt.toISOString(),
});

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

@Injectable()
export class FollowUpsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async audit(tx: Prisma.TransactionClient, user: AuthUser, ref: string, summary: string) {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await tx.auditLog.create({ data: { actorId: user.id, actorName: actor?.name ?? "Unknown", action: "lead.followUp", entity: "Lead", entityId: ref, summary } });
  }

  /** Open first (soonest due), then done (most recent). */
  async forLead(leadId: string) {
    const rows = await this.prisma.db.followUp.findMany({ where: { leadId }, include, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }] });
    return rows.map(toRecord);
  }

  /** The signed-in person's open follow-ups, soonest first (overview → My follow-ups). */
  async mine(user: AuthUser) {
    const rows = await this.prisma.db.followUp.findMany({ where: { assigneeId: user.id, doneAt: null }, include, orderBy: { dueAt: "asc" }, take: 50 });
    return rows.map(toRecord);
  }

  async create(user: AuthUser, leadId: string, input: FollowUpInput) {
    return this.prisma.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: leadId, deletedAt: null } });
      if (!lead) throw notFound("Lead");
      const assigneeId = input.assigneeId ?? lead.ownerId ?? user.id;
      const assignee = await tx.user.findFirst({ where: { id: assigneeId, disabledAt: null, roles: { hasSome: STAFF_ROLES } }, select: { id: true, name: true } });
      if (!assignee) throw new DomainError("VALIDATION", "Pick an active staff member");
      const dueAt = new Date(input.dueAt);
      const row = await tx.followUp.create({ data: { leadId, assigneeId, createdById: user.id, title: input.title, note: input.note || null, dueAt }, include });
      await activity(tx, leadId, `Follow-up set: ${input.title}`, `Due ${when.format(dueAt)} · ${assignee.name}`, true, user.id);
      await this.audit(tx, user, lead.ref, `Follow-up for ${assignee.name}, due ${when.format(dueAt)}: ${input.title}`);
      return toRecord(row);
    });
  }

  /** Mark done / reopen, or move the due time (which re-arms the reminder). */
  async update(user: AuthUser, id: string, change: FollowUpUpdate) {
    return this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.followUp.findUnique({ where: { id }, include });
      if (!existing) throw notFound("Follow-up");
      const data: Prisma.FollowUpUpdateInput = {};
      if (change.done === true && !existing.doneAt) Object.assign(data, { doneAt: new Date(), doneById: user.id });
      if (change.done === false) Object.assign(data, { doneAt: null, doneById: null });
      if (change.dueAt) Object.assign(data, { dueAt: new Date(change.dueAt), reminderSentAt: null });
      const row = await tx.followUp.update({ where: { id }, data, include });
      if (change.done === true && !existing.doneAt) {
        const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
        await activity(tx, existing.leadId, `Follow-up done: ${existing.title}`, actor?.name ?? null, true, user.id);
      }
      const what = change.done === true ? "done" : change.done === false ? "reopened" : `moved to ${when.format(new Date(change.dueAt!))}`;
      await this.audit(tx, user, existing.lead.ref, `Follow-up ${what}: ${existing.title}`);
      return toRecord(row);
    });
  }
}
