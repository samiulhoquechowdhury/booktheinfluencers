import { Inject, Injectable } from "@nestjs/common";
import { hashPassword, verifyPassword, type Prisma, type Role, type User } from "@repo/db";
import type { StaffAccount, StaffCreateInput, StaffUpdateInput, SuperAdminTransferInput, TemporaryPassword } from "@repo/schemas";
import { DomainError, forbidden, notFound } from "../common/errors";
import { STAFF_ROLES, type AuthUser } from "../auth/guard";
import { newTemporaryPassword } from "../auth/crypto";
import { PrismaService } from "../prisma/prisma.service";

// Staff accounts (the super admin only). Every change is audited; deactivating, resetting a password or an
// authenticator signs the person out everywhere. There is exactly one super admin: the role can't be ticked
// on anyone, only handed over with transfer().

type Tx = Prisma.TransactionClient;

const isStaff = { roles: { hasSome: STAFF_ROLES } } satisfies Prisma.UserWhereInput;

const toAccount = (u: User): StaffAccount => ({
  id: u.id,
  name: u.name,
  email: u.email ?? "",
  roles: u.roles.filter((r): r is StaffAccount["roles"][number] => STAFF_ROLES.includes(r)),
  active: !u.disabledAt,
  mfaEnrolled: Boolean(u.mfaSecret),
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

@Injectable()
export class StaffAccountsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private requireAdmin(user: AuthUser) {
    if (!user.roles.includes("SUPER_ADMIN")) throw forbidden("Only super admins manage staff");
  }

  private async audit(tx: Tx, user: AuthUser, action: string, target: User, summary: string) {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await tx.auditLog.create({ data: { actorId: user.id, actorName: actor?.name ?? "Unknown", action, entity: "Staff", entityId: target.email ?? target.id, summary } });
  }

  private async target(tx: Tx, id: string) {
    const target = await tx.user.findFirst({ where: { id, ...isStaff } });
    if (!target) throw notFound("Staff member");
    return target;
  }

  private signOutEverywhere = (tx: Tx, userId: string) => tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

  async list(user: AuthUser) {
    this.requireAdmin(user);
    const rows = await this.prisma.db.user.findMany({ where: isStaff, orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { name: "asc" }] });
    return rows.map(toAccount);
  }

  /** Names for owner pickers: any staff member can read who's active. */
  async directory() {
    const rows = await this.prisma.db.user.findMany({ where: { ...isStaff, disabledAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, roles: true } });
    return rows.map((r) => ({ id: r.id, name: r.name, roles: r.roles.filter((role) => STAFF_ROLES.includes(role)) }));
  }

  async create(user: AuthUser, input: StaffCreateInput): Promise<StaffAccount & TemporaryPassword> {
    this.requireAdmin(user);
    const temporaryPassword = newTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    return this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: input.email } });
      if (existing) throw new DomainError("DUPLICATE", "Someone already uses that email", 409);
      // input.roles never includes SUPER_ADMIN (AssignableRoleSchema): there's only one, moved by transfer().
      const created = await tx.user.create({ data: { name: input.name, email: input.email, roles: input.roles as Role[], passwordHash, mustChangePassword: true } });
      await this.audit(tx, user, "staff.create", created, `${created.name} added as ${input.roles.join(", ")}`);
      return { ...toAccount(created), temporaryPassword };
    });
  }

  async update(user: AuthUser, id: string, input: StaffUpdateInput) {
    this.requireAdmin(user);
    return this.prisma.db.$transaction(async (tx) => {
      const target = await this.target(tx, id);
      const isSuperAdmin = target.roles.includes("SUPER_ADMIN");
      if (!isSuperAdmin && input.roles.length === 0) throw new DomainError("VALIDATION", "Pick at least one role");
      // Non-staff roles (e.g. a staff member who's also a customer) and the super admin role are kept as they are.
      const kept = target.roles.filter((r) => !STAFF_ROLES.includes(r) || r === "SUPER_ADMIN");
      const updated = await tx.user.update({ where: { id }, data: { name: input.name, roles: [...kept, ...(input.roles as Role[])] } });
      const before = toAccount(target).roles.join(", ");
      const after = toAccount(updated).roles.join(", ");
      await this.audit(tx, user, "staff.update", updated, before === after ? `Renamed to ${input.name}` : `Roles: ${before} → ${after}`);
      return toAccount(updated);
    });
  }

  /**
   * Hands the super admin role to another active staff member. The current super admin confirms with
   * their password, keeps one ordinary role, and is signed out so their new permissions apply at once.
   */
  async transfer(user: AuthUser, id: string, input: SuperAdminTransferInput) {
    this.requireAdmin(user);
    if (id === user.id) throw new DomainError("SELF", "You're already the super admin", 409);
    const me = await this.prisma.db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!me.passwordHash || !(await verifyPassword(input.password, me.passwordHash))) throw new DomainError("INVALID_PASSWORD", "Your password is not right", 400);
    return this.prisma.db.$transaction(
      async (tx) => {
        const target = await this.target(tx, id);
        if (target.disabledAt) throw new DomainError("INACTIVE", "Reactivate them first", 409);
        // Signing in once means they've passed MFA (and, in production, set up an authenticator).
        if (!target.lastLoginAt && !target.mfaSecret) throw new DomainError("NO_MFA", `${target.name} hasn't signed in yet. They need to sign in once (and set up their authenticator) first.`, 409);
        const mine = me.roles.filter((r) => r !== "SUPER_ADMIN" && r !== input.keepRole);
        await tx.user.update({ where: { id: me.id }, data: { roles: [...mine, input.keepRole as Role] } });
        const updated = await tx.user.update({ where: { id }, data: { roles: [...target.roles.filter((r) => r !== "SUPER_ADMIN"), "SUPER_ADMIN"] } });
        await this.signOutEverywhere(tx, me.id);
        await this.audit(tx, user, "staff.transferSuperAdmin", updated, `Super admin handed from ${me.name} to ${updated.name}; ${me.name} keeps ${input.keepRole}`);
        return toAccount(updated);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async setActive(user: AuthUser, id: string, active: boolean) {
    this.requireAdmin(user);
    return this.prisma.db.$transaction(async (tx) => {
      const target = await this.target(tx, id);
      if (!active && id === user.id) throw new DomainError("SELF", "You can't deactivate your own account", 409);
      if (!active && target.roles.includes("SUPER_ADMIN")) throw new DomainError("SUPER_ADMIN", "Transfer the super admin role before deactivating this account", 409);
      const updated = await tx.user.update({ where: { id }, data: { disabledAt: active ? null : new Date() } });
      if (!active) await this.signOutEverywhere(tx, id);
      await this.audit(tx, user, active ? "staff.reactivate" : "staff.deactivate", updated, active ? "Account restored" : "Account deactivated and signed out");
      return toAccount(updated);
    });
  }

  async resetPassword(user: AuthUser, id: string): Promise<TemporaryPassword> {
    this.requireAdmin(user);
    const temporaryPassword = newTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.db.$transaction(async (tx) => {
      const target = await this.target(tx, id);
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      if (id !== user.id) await this.signOutEverywhere(tx, id);
      await this.audit(tx, user, "staff.resetPassword", target, "Temporary password issued");
    });
    return { temporaryPassword };
  }

  /** Lost phone: they set up a new authenticator at their next sign-in. */
  async resetMfa(user: AuthUser, id: string) {
    this.requireAdmin(user);
    return this.prisma.db.$transaction(async (tx) => {
      const target = await this.target(tx, id);
      const updated = await tx.user.update({ where: { id }, data: { mfaSecret: null } });
      if (id !== user.id) await this.signOutEverywhere(tx, id);
      await this.audit(tx, user, "staff.resetMfa", target, "Authenticator reset");
      return toAccount(updated);
    });
  }
}
