import type { PrismaClient } from "@repo/db";
import type { CalendarEntry, TalentCalendar } from "@repo/schemas";

/** AVL-4 / TAL-3: one talent's calendar, as both the CRM and the portal read it. */
export async function calendarOf(db: PrismaClient, talent: { id: string; blackoutSelfEdit: boolean }): Promise<TalentCalendar> {
  const rows = await db.blackout.findMany({
    where: { talentId: talent.id },
    orderBy: { date: "asc" },
    include: { booking: { select: { leadId: true, lead: { select: { ref: true } } } } },
  });
  const entries = rows.map<CalendarEntry>((r) => ({
    date: r.date,
    source: r.booking ? "booking" : r.locked ? "manager" : "artist",
    note: r.note,
    ref: r.booking?.lead.ref ?? null,
    leadId: r.booking?.leadId ?? null,
  }));
  return { seeded: rows.filter((r) => r.locked).map((r) => r.date), all: rows.map((r) => r.date), entries, selfEdit: talent.blackoutSelfEdit };
}
