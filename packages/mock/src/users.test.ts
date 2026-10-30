import { beforeEach, describe, expect, it } from "vitest";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { assertCanSignIn, canUseAccount, listUsers, restoreUser, restrictUser, signOutUser, userDetail } from "./users";
import type { MockDb } from "./types";

const admin = STAFF_USERS.find((s) => s.roles.includes("SUPER_ADMIN"))!;
const sales = STAFF_USERS.find((s) => s.roles.includes("SALES"))!;

let db: MockDb;
beforeEach(() => {
  db = buildSeed();
});

describe("mock users", () => {
  it("lists and searches for super admins only", () => {
    expect(() => listUsers(db, sales)).toThrow(/role/);
    const user = db.users[0]!;
    const page = listUsers(db, admin, { q: user.phone });
    expect(page.rows.map((r) => r.id)).toEqual([user.id]);
    expect(listUsers(db, admin).counts.all).toBe(db.users.length);
  });

  it("blocks, then restores, an account", () => {
    const user = db.users[0]!;
    expect(() => restrictUser(db, admin, user.id, { kind: "BLOCKED", reason: "x" })).toThrow(/reason/);
    restrictUser(db, admin, user.id, { kind: "BLOCKED", reason: "Fake enquiries" });
    expect(canUseAccount(user)).toBe(false);
    expect(() => assertCanSignIn(user)).toThrow(/blocked/);
    expect(userDetail(db, admin, user.id)).toMatchObject({ status: "BLOCKED", restriction: { reason: "Fake enquiries", byName: admin.name } });
    expect(listUsers(db, admin, { status: "BLOCKED" }).rows).toHaveLength(1);
    restoreUser(db, admin, user.id);
    expect(canUseAccount(user)).toBe(true);
    expect(() => restoreUser(db, admin, user.id)).toThrow(/already active/);
    expect(db.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["user.blocked", "user.restored"]));
  });

  it("signs someone out without restricting them", () => {
    const user = db.users[0]!;
    signOutUser(db, admin, user.id);
    expect(canUseAccount(user)).toBe(false);
    expect(() => assertCanSignIn(user)).not.toThrow();
  });
});
