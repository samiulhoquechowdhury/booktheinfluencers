import { ChangePasswordSchema, StaffCreateSchema, StaffUpdateSchema, type StaffAccount } from "@repo/schemas";
import { DEMO_OTP, STAFF_DEMO_PASSWORD, STAFF_USERS, type StaffUser } from "./internal";
import { ApiError, newId, nowIso } from "./server";
import { audit } from "./staff";
import type { MockDb, StaffAccountRec } from "./types";

// Staff accounts for the in-browser mock. Mirrors apps/api/src/staff-accounts and the staff sign-in rules.

export const seedStaffAccounts = (): StaffAccountRec[] =>
  STAFF_USERS.map((s) => ({ ...s, active: true, password: STAFF_DEMO_PASSWORD, mustChangePassword: false, mfaEnrolled: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00.000Z" }));

export const toStaffUser = ({ id, name, email, roles }: StaffAccountRec): StaffUser => ({ id, name, email, roles });

const toAccount = (a: StaffAccountRec): StaffAccount => ({
  id: a.id,
  name: a.name,
  email: a.email,
  roles: a.roles,
  active: a.active,
  mfaEnrolled: a.mfaEnrolled,
  mustChangePassword: a.mustChangePassword,
  lastLoginAt: a.lastLoginAt,
  createdAt: a.createdAt,
});

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!result.success) throw new ApiError("VALIDATION", result.error.issues[0]?.message ?? "Please check the form");
  return result.data;
}

function requireAdmin(actor: StaffUser) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "Only super admins manage staff");
}

function mustAccount(db: MockDb, id: string) {
  const account = db.staffAccounts.find((a) => a.id === id);
  if (!account) throw new ApiError("NOT_FOUND", "Staff member not found");
  return account;
}

function keepASuperAdmin(db: MockDb, exceptId: string) {
  if (!db.staffAccounts.some((a) => a.id !== exceptId && a.active && a.roles.includes("SUPER_ADMIN"))) {
    throw new ApiError("LAST_SUPER_ADMIN", "There must always be at least one active super admin");
  }
}

/** Demo temporary passwords are readable on purpose; the API generates random ones. */
const temporaryPassword = () => `Temp-${Math.random().toString(36).slice(2, 8)}-${Math.floor(Math.random() * 90 + 10)}`;

// ---------- Sign-in ----------

export function staffPasswordStep(db: MockDb, email: string, password: string) {
  const account = db.staffAccounts.find((a) => a.email === email.trim().toLowerCase());
  if (!account || account.password !== password) throw new ApiError("INVALID_LOGIN", "Email or password is incorrect");
  if (!account.active) throw new ApiError("ACCOUNT_DISABLED", "This account has been deactivated. Ask a super admin to restore it.");
  if (account.mfaEnrolled) return { staffId: account.id };
  const secret = "DEMODEMODEMODEMODEMODEMODEMODEMO";
  return { staffId: account.id, setup: { secret, uri: `otpauth://totp/Book%20The%20Influencers:${encodeURIComponent(account.email)}?secret=${secret}&issuer=Book%20The%20Influencers` } };
}

export function staffCodeStep(db: MockDb, staffId: string, code: string) {
  if (code !== DEMO_OTP) throw new ApiError("OTP_INVALID", "That code is not right");
  const account = mustAccount(db, staffId);
  if (!account.active) throw new ApiError("ACCOUNT_DISABLED", "This account has been deactivated. Ask a super admin to restore it.");
  account.mfaEnrolled = true;
  account.lastLoginAt = nowIso();
  return account;
}

export function changeStaffPassword(db: MockDb, staffId: string, raw: unknown) {
  const { current, next } = parse(ChangePasswordSchema.safeParse(raw));
  const account = mustAccount(db, staffId);
  if (account.password !== current) throw new ApiError("INVALID_PASSWORD", "Your current password is not right");
  if (current === next) throw new ApiError("VALIDATION", "Choose a password you haven't used here");
  account.password = next;
  account.mustChangePassword = false;
}

// ---------- Super admin ----------

export function listStaff(db: MockDb, actor: StaffUser) {
  requireAdmin(actor);
  return db.staffAccounts.toSorted((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map(toAccount);
}

export const staffDirectory = (db: MockDb) =>
  db.staffAccounts.filter((a) => a.active).toSorted((a, b) => a.name.localeCompare(b.name)).map(({ id, name, roles }) => ({ id, name, roles }));

export function createStaff(db: MockDb, actor: StaffUser, raw: unknown) {
  requireAdmin(actor);
  const input = parse(StaffCreateSchema.safeParse(raw));
  if (db.staffAccounts.some((a) => a.email === input.email)) throw new ApiError("DUPLICATE", "Someone already uses that email");
  const password = temporaryPassword();
  const account: StaffAccountRec = { id: newId("stf"), ...input, active: true, password, mustChangePassword: true, mfaEnrolled: false, lastLoginAt: null, createdAt: nowIso() };
  db.staffAccounts.push(account);
  audit(db, actor, "staff.create", "Staff", account.email, `${account.name} added as ${input.roles.join(", ")}`);
  return { ...toAccount(account), temporaryPassword: password };
}

export function updateStaff(db: MockDb, actor: StaffUser, id: string, raw: unknown) {
  requireAdmin(actor);
  const input = parse(StaffUpdateSchema.safeParse(raw));
  const account = mustAccount(db, id);
  const losingAdmin = account.roles.includes("SUPER_ADMIN") && !input.roles.includes("SUPER_ADMIN");
  if (losingAdmin && id === actor.id) throw new ApiError("SELF", "You can't remove your own super admin role");
  if (losingAdmin) keepASuperAdmin(db, id);
  const before = account.roles.join(", ");
  Object.assign(account, input);
  const after = input.roles.join(", ");
  audit(db, actor, "staff.update", "Staff", account.email, before === after ? `Renamed to ${input.name}` : `Roles: ${before} → ${after}`);
  return toAccount(account);
}

export function setStaffActive(db: MockDb, actor: StaffUser, id: string, active: boolean) {
  requireAdmin(actor);
  const account = mustAccount(db, id);
  if (!active && id === actor.id) throw new ApiError("SELF", "You can't deactivate your own account");
  if (!active && account.roles.includes("SUPER_ADMIN")) keepASuperAdmin(db, id);
  account.active = active;
  audit(db, actor, active ? "staff.reactivate" : "staff.deactivate", "Staff", account.email, active ? "Account restored" : "Account deactivated and signed out");
  return toAccount(account);
}

export function resetStaffPassword(db: MockDb, actor: StaffUser, id: string) {
  requireAdmin(actor);
  const account = mustAccount(db, id);
  account.password = temporaryPassword();
  account.mustChangePassword = true;
  audit(db, actor, "staff.resetPassword", "Staff", account.email, "Temporary password issued");
  return { temporaryPassword: account.password };
}

export function resetStaffMfa(db: MockDb, actor: StaffUser, id: string) {
  requireAdmin(actor);
  const account = mustAccount(db, id);
  account.mfaEnrolled = false;
  audit(db, actor, "staff.resetMfa", "Staff", account.email, "Authenticator reset");
  return toAccount(account);
}
