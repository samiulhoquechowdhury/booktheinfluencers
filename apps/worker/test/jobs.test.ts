import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@repo/db";
import { toIstDateKey } from "@repo/utils";
import type { Channel } from "../src/channels";
import { MAX_ATTEMPTS, dispatchNotifications } from "../src/jobs/dispatch";
import { LOGIN_HISTORY_DAYS, expireQuotes, markOverdueMilestones, pruneLoginEvents, sendEventReminders } from "../src/jobs/schedules";

const db = createPrismaClient(process.env.DATABASE_URL);
const DAY = 86_400_000;

afterAll(() => db.$disconnect());

/** Records what was "sent"; can be told to fail. */
function fakeChannel(fail = false) {
  const sent: string[] = [];
  const channel: Channel = {
    async send(n) {
      if (fail) throw new Error("provider down");
      sent.push(n.id);
    },
  };
  return { channel, sent };
}

const demoLead = () => db.lead.findFirstOrThrow({ where: { customerId: "usr_demo_customer" }, orderBy: { ref: "asc" } });

describe("dispatchNotifications", () => {
  beforeEach(async () => {
    await db.notification.deleteMany();
  });

  it("sends due notifications once and marks them sent", async () => {
    const lead = await demoLead();
    await db.notification.createMany({
      data: [
        { event: "quote.sent", channel: "SMS", to: "9876543210", body: "Due", leadId: lead.id },
        { event: "quote.sent", channel: "EMAIL", to: "a@example.com", body: "Later", leadId: lead.id, sendAfter: new Date(Date.now() + DAY) },
      ],
    });
    const { channel, sent } = fakeChannel();
    expect(await dispatchNotifications(db, channel)).toEqual({ sent: 1, failed: 0 });
    expect(await dispatchNotifications(db, channel)).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(await db.notification.count({ where: { status: "SENT" } })).toBe(1);
  });

  it("never double-sends when two workers run at once", async () => {
    await db.notification.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ event: "x", channel: "SMS" as const, to: "9876543210", body: `#${i}` })) });
    const a = fakeChannel();
    const b = fakeChannel();
    await Promise.all([dispatchNotifications(db, a.channel), dispatchNotifications(db, b.channel)]);
    expect(a.sent.length + b.sent.length).toBe(10);
    expect(new Set([...a.sent, ...b.sent]).size).toBe(10);
  });

  it("backs off and gives up after the last attempt", async () => {
    const n = await db.notification.create({ data: { event: "x", channel: "SMS", to: "9876543210", body: "retry me" } });
    const { channel } = fakeChannel(true);
    let now = new Date();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      expect(await dispatchNotifications(db, channel, now)).toEqual({ sent: 0, failed: 1 });
      const row = await db.notification.findUniqueOrThrow({ where: { id: n.id } });
      expect(row.attempts).toBe(attempt);
      expect(row.lastError).toBe("provider down");
      now = new Date(row.sendAfter.getTime() + 1);
    }
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("FAILED");
    expect(await dispatchNotifications(db, channel, new Date(now.getTime() + 10 * DAY))).toEqual({ sent: 0, failed: 0 });
  });
});

describe("scheduled jobs", () => {
  it("expires stale quotes and logs it on the timeline", async () => {
    const quote = await db.quote.findFirstOrThrow({ where: { status: "SENT" }, include: { booking: true } });
    await db.quote.update({ where: { id: quote.id }, data: { validUntil: new Date(Date.now() - 1000) } });
    const result = await expireQuotes(db);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("EXPIRED");
    const timeline = await db.activity.findMany({ where: { leadId: quote.booking.leadId }, orderBy: { createdAt: "desc" }, take: 1 });
    expect(timeline[0]!.title).toMatch(/expired/);
  });

  it("marks unpaid milestones overdue and reminds exactly once", async () => {
    const m = await db.paymentMilestone.findFirstOrThrow({ where: { status: { in: ["PENDING", "LINK_SENT"] } } });
    await db.paymentMilestone.update({ where: { id: m.id }, data: { dueDate: new Date(Date.now() - DAY) } });
    await markOverdueMilestones(db);
    await markOverdueMilestones(db);
    expect((await db.paymentMilestone.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("OVERDUE");
    const reminders = await db.notification.findMany({ where: { event: "payment.overdue", dedupeKey: { startsWith: `overdue:${m.id}` } } });
    expect(reminders.length).toBeGreaterThanOrEqual(1);
    expect(new Set(reminders.map((r) => r.channel)).size).toBe(reminders.length); // one per channel, no repeats
  });

  it("sends 3-day and 1-day event reminders once each, to customer and talent", async () => {
    const booking = await db.booking.findFirstOrThrow({ where: { availability: "CONFIRMED", completedAt: null }, include: { talent: true } });
    const now = new Date();
    const inThreeDays = toIstDateKey(new Date(now.getTime() + 3 * DAY));
    await db.lead.update({ where: { id: booking.leadId }, data: { eventDate: inThreeDays } });
    // Give the talent a portal login so they get their reminder too.
    await db.talent.update({ where: { id: booking.talentId }, data: { userId: "usr_talent_kabir-malhotra" } });

    await sendEventReminders(db, now);
    await sendEventReminders(db, now);
    const rows = await db.notification.findMany({ where: { event: "event.reminder", dedupeKey: { contains: booking.id } } });
    const keys = rows.map((r) => r.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => k?.endsWith(":customer:sms"))).toBe(true);
    expect(keys.some((k) => k?.endsWith(":talent"))).toBe(true);
    // Talent copy never mentions money.
    expect(rows.find((r) => r.dedupeKey?.endsWith(":talent"))!.body).not.toMatch(/₹|paise|price/i);
  });
});

describe("sign-in history", () => {
  it(`keeps ${LOGIN_HISTORY_DAYS} days and deletes older entries`, async () => {
    const old = await db.loginEvent.create({ data: { audience: "staff", event: "sign_in", identifier: "old@demo.in", createdAt: new Date(Date.now() - (LOGIN_HISTORY_DAYS + 1) * DAY) } });
    const recent = await db.loginEvent.create({ data: { audience: "staff", event: "sign_in", identifier: "recent@demo.in", createdAt: new Date(Date.now() - 5 * DAY) } });
    const { deleted } = await pruneLoginEvents(db);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await db.loginEvent.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.loginEvent.findUnique({ where: { id: recent.id } })).not.toBeNull();
    await db.loginEvent.delete({ where: { id: recent.id } });
  });
});
