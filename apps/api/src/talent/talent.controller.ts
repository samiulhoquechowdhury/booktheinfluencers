import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@repo/db";
import { TalentBookingSchema } from "@repo/schemas";
import { DomainError, notFound } from "../common/errors";
import { iso, paise, parse } from "../common/validate";
import { CurrentUser, Roles, type AuthUser } from "../auth/guard";
import { calendarOf } from "./calendar";
import { PrismaService } from "../prisma/prisma.service";
import { MessageBody, toMessage } from "../me/me.controller";

const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

const bookingInclude = {
  lead: true,
  payout: true,
  quotes: { where: { status: "ACCEPTED" }, include: { lineItems: { where: { type: "TALENT_FEE" } } } },
} satisfies Prisma.BookingInclude;

/**
 * TAL-1/TAL-2: the talent's own bookings with their contracted payout only. Never the selling
 * price, quote lines, budget or margin — the strict TalentBookingSchema throws if one slips in.
 */
function toTalentBooking(b: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) {
  const contractedPayout = b.payoutTotalPaise ?? b.quotes[0]?.lineItems.reduce((sum, l) => sum + l.internalCostPaise, 0n) ?? null;
  return TalentBookingSchema.parse({
    id: b.id,
    ref: b.lead.ref,
    eventType: b.lead.eventType,
    eventDate: b.lead.eventDate,
    city: b.lead.city,
    venue: b.lead.venue,
    durationMins: b.lead.durationMins,
    audienceSize: b.lead.audienceSize,
    availability: b.availability,
    completedAt: iso(b.completedAt),
    cancelledAt: iso(b.cancelledAt),
    payoutPaise: paise(contractedPayout),
    payoutStatus: b.payout?.status ?? null,
  });
}

@Controller("talent")
@Roles("TALENT")
export class TalentPortalController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get("bookings")
  async bookings(@CurrentUser() user: AuthUser) {
    const talent = await this.talentOf(user);
    const rows = await this.prisma.db.booking.findMany({
      // Requests appear once our team has asked the artist's side about the date.
      where: { talentId: talent.id, availability: { not: "NOT_CHECKED" } },
      include: bookingInclude,
      orderBy: { lead: { eventDate: "asc" } },
    });
    return rows.map(toTalentBooking);
  }

  @Get("bookings/:id")
  async booking(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return toTalentBooking(await this.ownBooking(user, id));
  }

  @Get("bookings/:id/messages")
  async messages(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.ownBooking(user, id);
    const rows = await this.prisma.db.message.findMany({ where: { bookingId: id }, orderBy: { createdAt: "asc" } });
    return rows.map(toMessage);
  }

  @Post("bookings/:id/messages")
  async send(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { body: text } = parse(MessageBody, body);
    await this.ownBooking(user, id);
    const author = await this.prisma.db.user.findUniqueOrThrow({ where: { id: user.id } });
    return toMessage(await this.prisma.db.message.create({ data: { bookingId: id, author: "TALENT", authorId: user.id, authorName: author.name, body: text } }));
  }

  /** TAL-3 / AVL-4 */
  @Get("blackouts")
  async blackouts(@CurrentUser() user: AuthUser) {
    return calendarOf(this.prisma.db, await this.talentOf(user));
  }

  @Put("blackouts/:date")
  @HttpCode(204)
  async block(@CurrentUser() user: AuthUser, @Param("date") raw: string) {
    const date = parse(DateParam, raw);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    if (date < today) throw new DomainError("VALIDATION", "Blackout dates must be in the future");
    const talent = await this.editableTalent(user);
    await this.prisma.db.blackout.upsert({ where: { talentId_date: { talentId: talent.id, date } }, create: { talentId: talent.id, date }, update: {} });
  }

  @Delete("blackouts/:date")
  @HttpCode(204)
  async unblock(@CurrentUser() user: AuthUser, @Param("date") raw: string) {
    const date = parse(DateParam, raw);
    const talent = await this.editableTalent(user);
    const row = await this.prisma.db.blackout.findUnique({ where: { talentId_date: { talentId: talent.id, date } } });
    if (row?.bookingId) throw new DomainError("BOOKED", "You have a confirmed booking on this date", 409);
    if (row?.locked) throw new DomainError("LOCKED", "This date was set by your manager — ask them to clear it", 409);
    await this.prisma.db.blackout.deleteMany({ where: { talentId: talent.id, date } });
  }

  /** TAL-3: the talent team can switch self-editing off for an artist. */
  private async editableTalent(user: AuthUser) {
    const talent = await this.talentOf(user);
    if (!talent.blackoutSelfEdit) throw new DomainError("FORBIDDEN", "Your manager looks after your calendar — ask them to change a date", 403);
    return talent;
  }

  private async talentOf(user: AuthUser) {
    const talent = await this.prisma.db.talent.findUnique({ where: { userId: user.id } });
    if (!talent) throw notFound("Talent profile");
    return talent;
  }

  private async ownBooking(user: AuthUser, id: string) {
    const talent = await this.talentOf(user);
    const booking = await this.prisma.db.booking.findFirst({ where: { id, talentId: talent.id, availability: { not: "NOT_CHECKED" } }, include: bookingInclude });
    if (!booking) throw notFound("Booking");
    return booking;
  }
}
