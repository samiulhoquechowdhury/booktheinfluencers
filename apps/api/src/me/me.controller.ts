import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { notFound } from "../common/errors";
import { parse } from "../common/validate";
import { CurrentUser, Roles, type AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";

export const MessageBody = z.object({ body: z.string().trim().min(1, "Write a message first").max(2000, "Keep messages under 2000 characters") });

export const toMessage = (m: { id: string; author: string; authorName: string; body: string; createdAt: Date }) => ({
  id: m.id,
  author: m.author.toLowerCase() as "customer" | "talent" | "staff",
  authorName: m.authorName,
  body: m.body,
  at: m.createdAt.toISOString(),
});

/** The signed-in customer's own favourites (CAT-8), messages (CUS-3) and notifications. */
@Controller("me")
@Roles("CUSTOMER")
export class MeController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get("favourites")
  async favourites(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.db.favourite.findMany({ where: { userId: user.id }, include: { talent: { select: { slug: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => r.talent.slug);
  }

  @Put("favourites/:slug")
  @HttpCode(204)
  async save(@CurrentUser() user: AuthUser, @Param("slug") slug: string) {
    const talent = await this.prisma.db.talent.findFirst({ where: { slug, status: "PUBLISHED" } });
    if (!talent) throw notFound("Talent");
    await this.prisma.db.favourite.upsert({ where: { userId_talentId: { userId: user.id, talentId: talent.id } }, create: { userId: user.id, talentId: talent.id }, update: {} });
  }

  @Delete("favourites/:slug")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("slug") slug: string) {
    await this.prisma.db.favourite.deleteMany({ where: { userId: user.id, talent: { slug } } });
  }

  @Get("leads/:id/messages")
  async messages(@CurrentUser() user: AuthUser, @Param("id") leadId: string) {
    await this.ownLead(user, leadId);
    const rows = await this.prisma.db.message.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
    return rows.map(toMessage);
  }

  @Post("leads/:id/messages")
  async send(@CurrentUser() user: AuthUser, @Param("id") leadId: string, @Body() body: unknown) {
    const { body: text } = parse(MessageBody, body);
    await this.ownLead(user, leadId);
    const author = await this.prisma.db.user.findUniqueOrThrow({ where: { id: user.id } });
    const message = await this.prisma.db.message.create({ data: { leadId, author: "CUSTOMER", authorId: user.id, authorName: author.name, body: text } });
    return toMessage(message);
  }

  /** Booking updates and manager replies, newest first, with an unread count. */
  @Get("notifications")
  async notifications(@CurrentUser() user: AuthUser) {
    const [activities, replies, seen] = await Promise.all([
      this.prisma.db.activity.findMany({ where: { internal: false, lead: { customerId: user.id } }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.db.message.findMany({ where: { author: "STAFF", lead: { customerId: user.id } }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.db.notificationSeen.findUnique({ where: { userId: user.id } }),
    ]);
    const items = [
      ...activities.map((a) => ({ id: a.id, at: a.createdAt, title: a.title, body: a.body, href: `/account/bookings/${a.leadId}` })),
      ...replies.map((m) => ({
        id: m.id,
        at: m.createdAt,
        title: `New message from ${m.authorName}`,
        body: m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body,
        href: `/account/bookings/${m.leadId}#messages`,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 20);
    const since = seen?.seenAt.getTime() ?? 0;
    return { items: items.map((i) => ({ ...i, at: i.at.toISOString() })), unread: items.filter((i) => i.at.getTime() > since).length };
  }

  @Post("notifications/seen")
  @HttpCode(204)
  async markSeen(@CurrentUser() user: AuthUser) {
    await this.prisma.db.notificationSeen.upsert({ where: { userId: user.id }, create: { userId: user.id, seenAt: new Date() }, update: { seenAt: new Date() } });
  }

  private async ownLead(user: AuthUser, leadId: string) {
    const lead = await this.prisma.db.lead.findFirst({ where: { id: leadId, customerId: user.id, deletedAt: null }, select: { id: true } });
    if (!lead) throw notFound("Booking");
    return lead;
  }
}

