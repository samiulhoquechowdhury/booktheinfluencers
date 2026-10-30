import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { signInCustomer, signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
const phone = "9811100001";

const otp = async (number: string, as: "customer" | "talent" = "customer") => {
  await db.otpCode.deleteMany({ where: { phone: number } });
  await http().post("/v1/auth/otp/send").send({ phone: number }).expect(200);
  return http().post("/v1/auth/otp/verify").send({ phone: number, code: "123456", as });
};

beforeAll(async () => {
  ({ app, db, http } = await startApp());
  for (const role of ["admin", "sales"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
  await db.otpCode.deleteMany({ where: { phone } });
  tokens.customer = await signInCustomer(app, phone, "Blocky Customer");
});
afterAll(async () => {
  await db?.user.deleteMany({ where: { phone } });
  await app?.close();
});

describe("CRM users", () => {
  it("lists customers and artists for the super admin, never staff", async () => {
    await http().get("/v1/admin/users").set(as("sales")).expect(403);
    const page = await http().get("/v1/admin/users").query({ q: phone }).set(as("admin")).expect(200);
    expect(page.body.rows).toHaveLength(1);
    expect(page.body.rows[0]).toMatchObject({ name: "Blocky Customer", isCustomer: true, status: "ACTIVE" });
    expect(page.body.rows[0].lastLoginAt).toBeTruthy();

    const everyone = await http().get("/v1/admin/users").set(as("admin")).expect(200);
    expect(JSON.stringify(everyone.body)).not.toContain("@demo.in\",\"isCustomer\":false");
    const staff = await db.user.findFirstOrThrow({ where: { email: "sales@demo.in" } });
    await http().post(`/v1/admin/users/${staff.id}/restrict`).set(as("admin")).send({ kind: "BLOCKED", reason: "Should not work" }).expect(404);
  });

  it("locks a blocked account out at once, and a restore lets them back in", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { phone } });
    await http().get("/v1/auth/me").set(as("customer")).expect(200);
    await http().post(`/v1/admin/users/${user.id}/restrict`).set(as("admin")).send({ kind: "BLOCKED", reason: "no" }).expect(400);
    const blocked = await http().post(`/v1/admin/users/${user.id}/restrict`).set(as("admin")).send({ kind: "BLOCKED", reason: "Fake enquiries" }).expect(200);
    expect(blocked.body).toMatchObject({ status: "BLOCKED", restriction: { reason: "Fake enquiries" } });

    // The live token stops working straight away, every session is ended, and a fresh OTP doesn't get back in.
    await http().get("/v1/auth/me").set(as("customer")).expect(401);
    expect(await db.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    const attempt = await otp(phone);
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe("ACCOUNT_BLOCKED");
    expect(await db.loginEvent.count({ where: { userId: user.id, event: "sign_in_failed", detail: "Account blocked" } })).toBe(1);
    expect((await otp(phone, "talent")).status).toBe(403); // the artist tab is no way round it

    await http().post(`/v1/admin/users/${user.id}/restrict`).set(as("admin")).send({ kind: "DEACTIVATED", reason: "Asked to close it" }).expect(200);
    expect((await otp(phone)).body.error.code).toBe("ACCOUNT_DISABLED");
    const filtered = await http().get("/v1/admin/users").query({ status: "DEACTIVATED", q: phone }).set(as("admin")).expect(200);
    expect(filtered.body.total).toBe(1);

    await http().post(`/v1/admin/users/${user.id}/restore`).set(as("admin")).expect(200);
    await http().post(`/v1/admin/users/${user.id}/restore`).set(as("admin")).expect(409);
    expect((await otp(phone)).status).toBe(200);
    expect(await db.auditLog.count({ where: { entity: "User", entityId: user.id } })).toBe(3);
  });

  it("takes a blocked artist off the public site, and a restore brings them back", async () => {
    const talent = await db.talent.findFirstOrThrow({ where: { status: "PUBLISHED", userId: { not: null } } });
    const total = (await http().get("/v1/talents").expect(200)).body.meta.total;
    await http().post(`/v1/admin/users/${talent.userId}/restrict`).set(as("admin")).send({ kind: "BLOCKED", reason: "Failed the ID recheck" }).expect(200);
    await http().get(`/v1/talents/${talent.slug}`).expect(404);
    expect((await http().get("/v1/talents").expect(200)).body.meta.total).toBe(total - 1);
    await http().post(`/v1/admin/users/${talent.userId}/restore`).set(as("admin")).expect(200);
    await http().get(`/v1/talents/${talent.slug}`).expect(200);
    expect((await http().get("/v1/talents").expect(200)).body.meta.total).toBe(total);
  });

  it("signs someone out of every device without restricting them", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { phone } });
    expect(await db.session.count({ where: { userId: user.id, revokedAt: null } })).toBeGreaterThan(0);
    await http().post(`/v1/admin/users/${user.id}/sign-out`).set(as("admin")).expect(200);
    expect(await db.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect((await otp(phone)).status).toBe(200);
  });
});
