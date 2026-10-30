import { AccountRestrictSchema, type AccountStatus, type UserDetail, type UserFilters, type UserRow, type UsersPage } from "@repo/schemas";
import { TALENTS } from "./catalogue/data";
import type { StaffUser } from "./internal";
import { ApiError, nowIso } from "./server";
import { audit } from "./staff";
import { talentRecord } from "./talent-admin";
import type { MockDb, UserRec } from "./types";

// CRM → Users for the in-browser mock. Mirrors apps/api/src/users. The demo's public site is built from static
// sample data, so a blocked artist stays on it here; everything else matches.

const PAGE_SIZE = 25;
const CLOSED_STAGES = ["CLOSED", "LOST", "CANCELLED"];

const statusOf = (u: UserRec): AccountStatus => u.restriction?.kind ?? "ACTIVE";

/** False once the account is restricted, or a super admin signed it out. */
export const canUseAccount = (u: UserRec) => !u.restriction && !u.signedOutAt;

export function assertCanSignIn(u: UserRec) {
  if (u.restriction?.kind === "BLOCKED") throw new ApiError("ACCOUNT_BLOCKED", "This account has been blocked. Contact us if you think this is a mistake.");
  if (u.restriction) throw new ApiError("ACCOUNT_DISABLED", "This account has been deactivated. Contact us to restore it.");
}

function requireAdmin(actor: StaffUser) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "Your role can't do that");
}

function mustUser(db: MockDb, id: string) {
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new ApiError("NOT_FOUND", "User not found");
  return user;
}

function toRow(db: MockDb, u: UserRec): UserRow {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    isCustomer: u.roles.includes("CUSTOMER"),
    isArtist: u.roles.includes("TALENT"),
    status: statusOf(u),
    enquiryCount: db.leads.filter((l) => l.customerId === u.id).length,
    lastLoginAt: u.lastLoginAt ?? db.loginEvents.find((e) => e.userId === u.id && e.event === "sign_in")?.at ?? null,
    createdAt: u.createdAt,
  };
}

export function listUsers(db: MockDb, actor: StaffUser, f: UserFilters = {}): UsersPage {
  requireAdmin(actor);
  const q = f.q?.trim().toLowerCase();
  const base = db.users
    .filter((u) => (!f.type || u.roles.includes(f.type === "artist" ? "TALENT" : "CUSTOMER")) && (!q || `${u.name} ${u.phone} ${u.email ?? ""}`.toLowerCase().includes(q)))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const matching = f.status ? base.filter((u) => statusOf(u) === f.status) : base;
  const page = f.page ?? 1;
  const count = (status: AccountStatus) => base.filter((u) => statusOf(u) === status).length;
  return {
    rows: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((u) => toRow(db, u)),
    total: matching.length,
    page,
    pageCount: Math.max(1, Math.ceil(matching.length / PAGE_SIZE)),
    counts: { all: base.length, active: count("ACTIVE"), deactivated: count("DEACTIVATED"), blocked: count("BLOCKED") },
  };
}

export function userDetail(db: MockDb, actor: StaffUser, id: string): UserDetail {
  requireAdmin(actor);
  const u = mustUser(db, id);
  const leads = db.leads.filter((l) => l.customerId === id);
  const talent = u.talentSlug ? talentRecord(db, u.talentSlug) : null;
  const onboarding = u.talentSlug ? db.onboarding[u.talentSlug] : undefined;
  return {
    ...toRow(db, u),
    restriction: u.restriction ? { reason: u.restriction.reason, byName: u.restriction.byName, at: u.restriction.at } : null,
    artist: u.talentSlug
      ? { slug: u.talentSlug, stageName: onboarding?.profile.stageName || talent?.stageName || (TALENTS.find((t) => t.slug === u.talentSlug)?.stageName ?? u.name), reviewStatus: onboarding?.status ?? null, profileStatus: talent?.status ?? "DRAFT" }
      : null,
    openEnquiries: leads.filter((l) => !CLOSED_STAGES.includes(l.stage)).length,
    openBookings: u.talentSlug ? db.bookings.filter((b) => b.talentSlug === u.talentSlug && b.confirmedAt && !b.cancelledAt && !b.completedAt).length : 0,
    recentSignIns: db.loginEvents.filter((e) => e.userId === id).slice(0, 15),
  };
}

export function restrictUser(db: MockDb, actor: StaffUser, id: string, raw: unknown) {
  requireAdmin(actor);
  const parsed = AccountRestrictSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0]?.message ?? "Please check the form");
  const { kind, reason } = parsed.data;
  const u = mustUser(db, id);
  u.restriction = { kind, reason, byName: actor.name, at: u.restriction?.at ?? nowIso() };
  audit(db, actor, kind === "BLOCKED" ? "user.blocked" : "user.deactivated", "User", id, `${kind === "BLOCKED" ? "Blocked" : "Deactivated"} ${u.name}: ${reason}`);
}

export function restoreUser(db: MockDb, actor: StaffUser, id: string) {
  requireAdmin(actor);
  const u = mustUser(db, id);
  if (!u.restriction) throw new ApiError("NOT_RESTRICTED", "This account is already active");
  u.restriction = null;
  audit(db, actor, "user.restored", "User", id, `Restored ${u.name}'s account`);
}

export function signOutUser(db: MockDb, actor: StaffUser, id: string) {
  requireAdmin(actor);
  const u = mustUser(db, id);
  u.signedOutAt = nowIso();
  audit(db, actor, "user.signedOut", "User", id, `Signed ${u.name} out of every device`);
}
