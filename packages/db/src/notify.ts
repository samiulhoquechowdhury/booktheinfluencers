import type { Prisma } from "./generated/prisma/client";

// NOT-1…8: notifications go into the outbox inside the caller's transaction; apps/worker sends them.
// Shared by apps/api (business events) and apps/worker (reminders). `dedupeKey` makes a send idempotent.
// Customer and talent copy never carries internal figures (margin, payout to customers, selling price to talent).

type Tx = Prisma.TransactionClient;
type Message = { event: string; subject: string; body: string; dedupeKey?: string };

/** SMS to the verified phone, plus email when we have one. */
export async function notifyCustomer(tx: Tx, leadId: string, message: Message) {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, include: { customer: { select: { phone: true, email: true } } } });
  if (!lead) return;
  const email = lead.contactEmail ?? lead.customer.email;
  const rows: Prisma.NotificationCreateManyInput[] = [];
  if (lead.customer.phone) rows.push({ event: message.event, channel: "SMS", to: lead.customer.phone, body: `${message.body} Ref ${lead.ref}.`, leadId, dedupeKey: message.dedupeKey && `${message.dedupeKey}:sms` });
  if (email) rows.push({ event: message.event, channel: "EMAIL", to: email, subject: `${message.subject} · ${lead.ref}`, body: message.body, leadId, dedupeKey: message.dedupeKey && `${message.dedupeKey}:email` });
  if (rows.length) await tx.notification.createMany({ data: rows, skipDuplicates: true });
}

/** The talent's own login phone, when the profile is linked to one. */
export async function notifyTalent(tx: Tx, bookingId: string, message: Message) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { talent: { include: { user: { select: { phone: true } } } }, lead: true } });
  const phone = booking?.talent.user?.phone;
  if (!booking || !phone) return;
  await tx.notification.createMany({
    data: [{ event: message.event, channel: "SMS", to: phone, body: `${message.body} Ref ${booking.lead.ref}.`, leadId: booking.leadId, dedupeKey: message.dedupeKey }],
    skipDuplicates: true,
  });
}

/** Internal email to a staff member (NOT-8). */
export async function notifyStaff(tx: Tx, userId: string, message: Message & { leadId?: string }) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return;
  await tx.notification.create({ data: { event: message.event, channel: "EMAIL", to: user.email, subject: message.subject, body: message.body, leadId: message.leadId } });
}
