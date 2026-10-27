import { notifyCustomer, notifyTalent, type PrismaClient } from "@repo/db";
import { formatINR, toIstDateKey } from "@repo/utils";

const DAY = 86_400_000;

/** QUO-4: a quote past its validity can't be accepted; mark it so everyone sees why. */
export async function expireQuotes(db: PrismaClient, now = new Date()) {
  const stale = await db.quote.findMany({ where: { status: "SENT", validUntil: { lt: now } }, include: { booking: { include: { talent: true } } } });
  for (const q of stale) {
    await db.$transaction(async (tx) => {
      const updated = await tx.quote.updateMany({ where: { id: q.id, status: "SENT" }, data: { status: "EXPIRED" } });
      if (updated.count === 0) return; // accepted or replaced meanwhile
      await tx.activity.create({
        data: { leadId: q.booking.leadId, title: `Quote v${q.version} for ${q.booking.talent.stageName} expired`, body: "Ask your manager for a fresh quote." },
      });
    });
  }
  return { expired: stale.length };
}

/** NOT-3: unpaid milestones past their due date become OVERDUE, with one reminder each. */
export async function markOverdueMilestones(db: PrismaClient, now = new Date()) {
  const due = await db.paymentMilestone.findMany({
    where: { status: { in: ["PENDING", "LINK_SENT"] }, dueDate: { lt: now }, booking: { cancelledAt: null } },
    include: { booking: true },
  });
  for (const m of due) {
    await db.$transaction(async (tx) => {
      const updated = await tx.paymentMilestone.updateMany({ where: { id: m.id, status: { in: ["PENDING", "LINK_SENT"] } }, data: { status: "OVERDUE" } });
      if (updated.count === 0) return;
      await tx.activity.create({ data: { leadId: m.booking.leadId, title: `${m.label} payment is overdue`, body: "Pay from your booking page, or talk to your manager." } });
      await notifyCustomer(tx, m.booking.leadId, {
        event: "payment.overdue",
        subject: "Payment overdue",
        body: `Your ${m.label.toLowerCase()} payment of ${formatINR(m.amountPaise)} is overdue. Pay from your booking page.`,
        dedupeKey: `overdue:${m.id}`,
      });
    });
  }
  return { overdue: due.length };
}

/** NOT-6: reminders 3 days and 1 day before a confirmed event, to the customer and the talent. Idempotent per day. */
export async function sendEventReminders(db: PrismaClient, now = new Date()) {
  let queued = 0;
  for (const days of [3, 1]) {
    const eventDate = toIstDateKey(new Date(now.getTime() + days * DAY));
    const bookings = await db.booking.findMany({
      where: { availability: "CONFIRMED", cancelledAt: null, completedAt: null, lead: { eventDate } },
      include: { lead: true, talent: true },
    });
    for (const b of bookings) {
      const when = days === 1 ? "tomorrow" : `in ${days} days`;
      await db.$transaction(async (tx) => {
        await notifyCustomer(tx, b.leadId, {
          event: "event.reminder",
          subject: `${b.talent.stageName} performs ${when}`,
          body: `Reminder: ${b.talent.stageName} performs at your ${b.lead.eventType.toLowerCase()} ${when}.`,
          dedupeKey: `reminder:${days}d:${b.id}:customer`,
        });
        await notifyTalent(tx, b.id, {
          event: "event.reminder",
          subject: `Show ${when}`,
          body: `Reminder: your ${b.lead.eventType.toLowerCase()} in ${b.lead.city} is ${when} (${b.lead.eventDate}).`,
          dedupeKey: `reminder:${days}d:${b.id}:talent`,
        });
      });
      queued++;
    }
  }
  return { reminded: queued };
}

/** Sign-in history is kept for 180 days (CRM → Audit log → Sign-ins), then deleted. */
export const LOGIN_HISTORY_DAYS = 180;
export async function pruneLoginEvents(db: PrismaClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - LOGIN_HISTORY_DAYS * 24 * 60 * 60_000);
  const { count } = await db.loginEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { deleted: count };
}
