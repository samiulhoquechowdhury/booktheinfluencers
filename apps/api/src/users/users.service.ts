import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import type { AccountRestrictInput, AccountStatus, LoginEventRecord, UserDetail, UserFilters, UserRow, UsersPage } from "@repo/schemas";
import { DomainError, notFound } from "../common/errors";
import { STAFF_ROLES, type AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";

// Customers and artists. Staff are left out on purpose: they're managed in CRM → Staff, which has its own rules
// (one super admin, MFA). Restricting an account signs it out everywhere, and an artist's profile leaves the public
// site (catalogue/listed.ts). Nothing is deleted, so a restore brings everything back.

type Tx = Prisma.TransactionClient;

const PAGE_SIZE = 25;
const OPEN_STAGES_NOT = ["CLOSED", "LOST", "CANCELLED"] as const;
const SITE_USER = { deletedAt: null, NOT: { roles: { hasSome: STAFF_ROLES } } } satisfies Prisma.UserWhereInput;

const statusWhere: Record<AccountStatus, Prisma.UserWhereInput> = {
  ACTIVE: { disabledAt: null },
  DEACTIVATED: { disabledAt: { not: null }, disabledKind: "DEACTIVATED" },
  BLOCKED: { disabledAt: { not: null }, disabledKind: "BLOCKED" },
};

const rowInclude = { _count: { select: { leads: true } } } satisfies Prisma.UserInclude;

const toRow = (u: Prisma.UserGetPayload<{ include: typeof rowInclude }>): UserRow => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  isCustomer: u.roles.includes("CUSTOMER"),
  isArtist: u.roles.includes("TALENT"),
  status: u.disabledAt ? (u.disabledKind ?? "DEACTIVATED") : "ACTIVE",
  enquiryCount: u._count.leads,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async target(tx: Tx, id: string) {
    const target = await tx.user.findFirst({ where: { id, ...SITE_USER } });
    if (!target) throw notFound("User");
    return target;
  }

  private async audit(tx: Tx, user: AuthUser, action: string, targetId: string, summary: string) {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await tx.auditLog.create({ data: { actorId: user.id, actorName: actor?.name ?? "Unknown", action, entity: "User", entityId: targetId, summary } });
    return actor?.name ?? "Unknown";
  }

  async list(f: UserFilters & { page: number }): Promise<UsersPage> {
    const q = f.q?.trim();
    const base: Prisma.UserWhereInput = {
      ...SITE_USER,
      ...(f.type && { roles: { has: f.type === "artist" ? "TALENT" : "CUSTOMER" } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }),
    };
    const where = { ...base, ...(f.status && statusWhere[f.status]) };
    const [rows, total, all, active, deactivated, blocked] = await Promise.all([
      this.prisma.db.user.findMany({ where, include: rowInclude, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.db.user.count({ where }),
      this.prisma.db.user.count({ where: base }),
      this.prisma.db.user.count({ where: { ...base, ...statusWhere.ACTIVE } }),
      this.prisma.db.user.count({ where: { ...base, ...statusWhere.DEACTIVATED } }),
      this.prisma.db.user.count({ where: { ...base, ...statusWhere.BLOCKED } }),
    ]);
    return { rows: rows.map(toRow), total, page: f.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), counts: { all, active, deactivated, blocked } };
  }

  async detail(id: string): Promise<UserDetail> {
    const u = await this.prisma.db.user.findFirst({
      where: { id, ...SITE_USER },
      include: { ...rowInclude, talent: { select: { id: true, slug: true, stageName: true, reviewStatus: true, status: true } } },
    });
    if (!u) throw notFound("User");
    const [openEnquiries, openBookings, signIns] = await Promise.all([
      this.prisma.db.lead.count({ where: { customerId: id, stage: { notIn: [...OPEN_STAGES_NOT] } } }),
      u.talent ? this.prisma.db.booking.count({ where: { talentId: u.talent.id, confirmedAt: { not: null }, cancelledAt: null, completedAt: null } }) : 0,
      this.prisma.db.loginEvent.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 15 }),
    ]);
    return {
      ...toRow(u),
      restriction: u.disabledAt ? { reason: u.disabledReason, byName: u.disabledByName, at: u.disabledAt.toISOString() } : null,
      artist: u.talent && { slug: u.talent.slug, stageName: u.talent.stageName, reviewStatus: u.talent.reviewStatus, profileStatus: u.talent.status },
      openEnquiries,
      openBookings,
      recentSignIns: signIns.map(
        (e): LoginEventRecord => ({
          id: e.id,
          at: e.createdAt.toISOString(),
          userId: e.userId,
          userName: e.userName,
          identifier: e.identifier,
          audience: e.audience as LoginEventRecord["audience"],
          event: e.event as LoginEventRecord["event"],
          detail: e.detail,
          ip: e.ip,
          userAgent: e.userAgent,
        }),
      ),
    };
  }

  async restrict(user: AuthUser, id: string, input: AccountRestrictInput) {
    await this.prisma.db.$transaction(async (tx) => {
      const target = await this.target(tx, id);
      const word = input.kind === "BLOCKED" ? "Blocked" : "Deactivated";
      const name = await this.audit(tx, user, input.kind === "BLOCKED" ? "user.blocked" : "user.deactivated", id, `${word} ${target.name}: ${input.reason}`);
      await tx.user.update({ where: { id }, data: { disabledAt: target.disabledAt ?? new Date(), disabledKind: input.kind, disabledReason: input.reason, disabledByName: name } });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return this.detail(id);
  }

  async restore(user: AuthUser, id: string) {
    await this.prisma.db.$transaction(async (tx) => {
      const target = await this.target(tx, id);
      if (!target.disabledAt) throw new DomainError("NOT_RESTRICTED", "This account is already active", 409);
      await this.audit(tx, user, "user.restored", id, `Restored ${target.name}'s account`);
      await tx.user.update({ where: { id }, data: { disabledAt: null, disabledKind: null, disabledReason: null, disabledByName: null } });
    });
    return this.detail(id);
  }

  /** For a lost phone or a suspicious login: they can sign straight back in with their number. */
  async signOut(user: AuthUser, id: string) {
    await this.prisma.db.$transaction(async (tx) => {
      const target = await this.target(tx, id);
      await this.audit(tx, user, "user.signedOut", id, `Signed ${target.name} out of every device`);
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }
}
