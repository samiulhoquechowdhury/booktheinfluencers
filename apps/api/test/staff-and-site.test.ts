import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { totp } from "../src/auth/crypto";
import { signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (role: string) => ({ authorization: `Bearer ${tokens[role]}` });

beforeAll(async () => {
  ({ app, db, http } = await startApp());
  for (const role of ["admin", "sales"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
});
afterAll(async () => {
  await app?.close();
});

// Smallest valid JPEG header is enough: the API checks the signature, not the pixels.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);

describe("staff accounts", () => {
  it("creates staff who set up an authenticator and their own password at first sign-in", async () => {
    const email = `new.${Date.now()}@demo.in`;
    await http()
      .post("/v1/admin/staff")
      .set(as("sales"))
      .send({ name: "Nope", email, roles: ["SALES"] })
      .expect(403);
    const created = await http()
      .post("/v1/admin/staff")
      .set(as("admin"))
      .send({ name: "Asha Nair", email, roles: ["SALES", "OPS"] })
      .expect(201);
    expect(created.body).toMatchObject({
      email,
      roles: ["SALES", "OPS"],
      active: true,
      mfaEnrolled: false,
      mustChangePassword: true,
    });
    const temp = created.body.temporaryPassword as string;
    await http()
      .post("/v1/admin/staff")
      .set(as("admin"))
      .send({ name: "Twin", email, roles: ["SALES"] })
      .expect(409);

    const step1 = await http()
      .post("/v1/auth/staff/login")
      .send({ email, password: temp })
      .expect(200);
    expect(step1.body.setup.uri).toMatch(/^otpauth:\/\/totp\//);
    const step2 = await http()
      .post("/v1/auth/staff/mfa")
      .send({ mfaToken: step1.body.mfaToken, code: totp(step1.body.setup.secret) })
      .expect(200);
    expect(step2.body.user.mustChangePassword).toBe(true);
    const me = { authorization: `Bearer ${step2.body.accessToken}` };
    await http()
      .post("/v1/auth/staff/password")
      .set(me)
      .send({ current: temp, next: "short" })
      .expect(400);
    await http()
      .post("/v1/auth/staff/password")
      .set(me)
      .send({ current: temp, next: "a-better-pass-123" })
      .expect(204);

    const again = await http()
      .post("/v1/auth/staff/login")
      .send({ email, password: "a-better-pass-123" })
      .expect(200);
    expect(again.body.setup).toBeUndefined(); // authenticator now on file
    const list = await http().get("/v1/admin/staff").set(as("admin")).expect(200);
    expect(list.body.find((s: { email: string }) => s.email === email)).toMatchObject({
      mfaEnrolled: true,
      mustChangePassword: false,
    });
  });

  it("edits roles, deactivates and resets, and never locks out the last super admin", async () => {
    const email = `ops.${Date.now()}@demo.in`;
    const { body: staff } = await http()
      .post("/v1/admin/staff")
      .set(as("admin"))
      .send({ name: "Ravi Ops", email, roles: ["OPS"] })
      .expect(201);
    const updated = await http()
      .put(`/v1/admin/staff/${staff.id}`)
      .set(as("admin"))
      .send({ name: "Ravi Menon", roles: ["OPS", "ACCOUNTS"] })
      .expect(200);
    expect(updated.body).toMatchObject({ name: "Ravi Menon", roles: ["OPS", "ACCOUNTS"] });

    await http()
      .post(`/v1/admin/staff/${staff.id}/active`)
      .set(as("admin"))
      .send({ active: false })
      .expect(200);
    const blocked = await http()
      .post("/v1/auth/staff/login")
      .send({ email, password: staff.temporaryPassword })
      .expect(403);
    expect(blocked.body.error.code).toBe("ACCOUNT_DISABLED");
    const directory = await http().get("/v1/admin/staff-directory").set(as("sales")).expect(200);
    expect(directory.body.some((s: { id: string }) => s.id === staff.id)).toBe(false);
    await http()
      .post(`/v1/admin/staff/${staff.id}/active`)
      .set(as("admin"))
      .send({ active: true })
      .expect(200);

    const reset = await http()
      .post(`/v1/admin/staff/${staff.id}/reset-password`)
      .set(as("admin"))
      .expect(200);
    await http()
      .post("/v1/auth/staff/login")
      .send({ email, password: reset.body.temporaryPassword })
      .expect(200);
    await http()
      .post("/v1/auth/staff/login")
      .send({ email, password: staff.temporaryPassword })
      .expect(401);

    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.in" } });
    await http()
      .post(`/v1/admin/staff/${admin.id}/active`)
      .set(as("admin"))
      .send({ active: false })
      .expect(409);

    const audit = await db.auditLog.findMany({ where: { entity: "Staff", entityId: email } });
    expect(audit.map((a) => a.action).sort()).toEqual([
      "staff.create",
      "staff.deactivate",
      "staff.reactivate",
      "staff.resetPassword",
      "staff.update",
    ]);
  });
});

describe("one super admin", () => {
  it("can't be granted by ticking a role, only handed over", async () => {
    const email = `boss.${Date.now()}@demo.in`;
    await http()
      .post("/v1/admin/staff")
      .set(as("admin"))
      .send({ name: "Second Boss", email, roles: ["SUPER_ADMIN"] })
      .expect(400);
    const { body: staff } = await http()
      .post("/v1/admin/staff")
      .set(as("admin"))
      .send({ name: "Next Boss", email, roles: ["SALES"] })
      .expect(201);
    await http()
      .put(`/v1/admin/staff/${staff.id}`)
      .set(as("admin"))
      .send({ name: "Next Boss", roles: ["SUPER_ADMIN"] })
      .expect(400);

    // Editing the super admin's own roles never removes the super admin role.
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.in" } });
    const self = await http()
      .put(`/v1/admin/staff/${admin.id}`)
      .set(as("admin"))
      .send({ name: admin.name, roles: [] })
      .expect(200);
    expect(self.body.roles).toEqual(["SUPER_ADMIN"]);

    const transfer = (to: string, token: string, body: object) =>
      http()
        .post(`/v1/admin/staff/${to}/make-super-admin`)
        .set({ authorization: `Bearer ${token}` })
        .send(body);
    expect(
      (
        await transfer(staff.id, tokens.admin!, { password: "demo1234", keepRole: "OPS" }).expect(
          409,
        )
      ).body.error.code,
    ).toBe("NO_MFA");

    // They sign in once (sets up the authenticator), then the handover works.
    const step1 = await http()
      .post("/v1/auth/staff/login")
      .send({ email, password: staff.temporaryPassword })
      .expect(200);
    const login = await http()
      .post("/v1/auth/staff/mfa")
      .send({ mfaToken: step1.body.mfaToken, code: totp(step1.body.setup.secret) })
      .expect(200);
    await transfer(staff.id, tokens.admin!, {
      password: "wrong-password-1",
      keepRole: "OPS",
    }).expect(400);
    await transfer(staff.id, tokens.admin!, { password: "demo1234", keepRole: "OPS" }).expect(200);
    try {
      const supers = await db.user.findMany({
        where: { roles: { has: "SUPER_ADMIN" } },
        select: { email: true },
      });
      expect(supers).toEqual([{ email }]);
      expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).roles).toEqual(["OPS"]);
      await http().get("/v1/admin/staff").set(as("admin")).expect(403); // the old token loses super admin at once

      // Hand it back so other tests keep admin@demo.in as the super admin.
      await transfer(admin.id, login.body.accessToken, {
        password: staff.temporaryPassword,
        keepRole: "SALES",
      }).expect(200);
    } finally {
      await db.user.update({ where: { id: staff.id }, data: { roles: ["SALES"] } });
      await db.user.update({ where: { id: admin.id }, data: { roles: ["SUPER_ADMIN"] } });
    }
    tokens.admin = await signInStaff(app, "admin@demo.in");
    expect(await db.user.count({ where: { roles: { has: "SUPER_ADMIN" } } })).toBe(1);
  });

  it("applies a deactivation on the very next request", async () => {
    const email = `gone.${Date.now()}@demo.in`;
    const { body: staff } = await http()
      .post("/v1/admin/staff")
      .set(as("admin"))
      .send({ name: "Soon Gone", email, roles: ["OPS"] })
      .expect(201);
    const step1 = await http()
      .post("/v1/auth/staff/login")
      .send({ email, password: staff.temporaryPassword })
      .expect(200);
    const login = await http()
      .post("/v1/auth/staff/mfa")
      .send({ mfaToken: step1.body.mfaToken, code: "123456" })
      .expect(200);
    const theirs = { authorization: `Bearer ${login.body.accessToken}` };
    await http().get("/v1/admin/leads").set(theirs).expect(200);
    await http()
      .post(`/v1/admin/staff/${staff.id}/active`)
      .set(as("admin"))
      .send({ active: false })
      .expect(200);
    await http().get("/v1/admin/leads").set(theirs).expect(401);
  });
});

describe("website hero", () => {
  it("lets super admins upload a photo, add, reorder, hide and remove slides", async () => {
    await http()
      .post("/v1/admin/media?width=1672&height=941")
      .set(as("sales"))
      .set("content-type", "image/jpeg")
      .send(JPEG)
      .expect(403);
    await http()
      .post("/v1/admin/media?width=1672&height=941")
      .set(as("admin"))
      .set("content-type", "image/png")
      .send(JPEG)
      .expect(400);
    await http()
      .post("/v1/admin/media?width=200&height=100")
      .set(as("admin"))
      .set("content-type", "image/jpeg")
      .send(JPEG)
      .expect(400);
    const upload = await http()
      .post("/v1/admin/media?width=1672&height=941")
      .set(as("admin"))
      .set("content-type", "image/jpeg")
      .send(JPEG)
      .expect(201);
    const served = await http().get(upload.body.url).expect(200);
    expect(served.headers["content-type"]).toBe("image/jpeg");
    expect(served.headers["cache-control"]).toContain("immutable");

    const slide = {
      eyebrow: "Stars & creators",
      title: "From the big screen",
      accent: "to every feed.",
      body: "Actors, playback singers and creators, booked through their own managers.",
      ctaLabel: "Browse creators",
      ctaHref: "/categories/creators",
      imageAlt: "Film stars beside creators filming on phones",
      imageId: null,
      active: true,
    };
    await http().post("/v1/admin/site/hero").set(as("admin")).send(slide).expect(409); // no photo yet
    await http()
      .post("/v1/admin/site/hero")
      .set(as("admin"))
      .send({ ...slide, ctaHref: "javascript:alert(1)", imageId: upload.body.id })
      .expect(400);
    const created = await http()
      .post("/v1/admin/site/hero")
      .set(as("admin"))
      .send({ ...slide, imageId: upload.body.id })
      .expect(201);

    const pub = await http().get("/v1/site/hero").expect(200);
    expect(pub.body.at(-1)).toMatchObject({
      title: "From the big screen",
      imageUrl: upload.body.url,
    });

    const all = await http().get("/v1/admin/site/hero").set(as("admin")).expect(200);
    const ids = all.body.map((s: { id: string }) => s.id);
    await http()
      .post("/v1/admin/site/hero-order")
      .set(as("admin"))
      .send({ ids: [created.body.id, ...ids.filter((id: string) => id !== created.body.id)] })
      .expect(204);
    expect((await http().get("/v1/site/hero")).body[0].id).toBe(created.body.id);

    await http()
      .put(`/v1/admin/site/hero/${created.body.id}`)
      .set(as("admin"))
      .send({ ...slide, imageId: upload.body.id, active: false })
      .expect(200);
    expect(
      (await http().get("/v1/site/hero")).body.some(
        (s: { id: string }) => s.id === created.body.id,
      ),
    ).toBe(false);
    await http().delete(`/v1/admin/site/hero/${created.body.id}`).set(as("admin")).expect(204);
  });

  it("always keeps one slide on the home page", async () => {
    const live = (await http().get("/v1/admin/site/hero").set(as("admin"))).body.filter(
      (s: { active: boolean }) => s.active,
    );
    if (live.length !== 1) return;
    const [only] = live;
    const { id, position: _p, imageUrl: _u, updatedAt: _t, ...input } = only;
    await http()
      .put(`/v1/admin/site/hero/${id}`)
      .set(as("admin"))
      .send({ ...input, active: false })
      .expect(409);
    await http().delete(`/v1/admin/site/hero/${id}`).set(as("admin")).expect(409);
  });
});

describe("sign-in history", () => {
  it("records staff and customer sign-ins, failures and sign-outs for the super admin", async () => {
    const ua = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0" };
    await http().post("/v1/auth/staff/login").set(ua).send({ email: "sales@demo.in", password: "wrong-one" }).expect(401);
    const step1 = await http().post("/v1/auth/staff/login").set(ua).send({ email: "sales@demo.in", password: "demo1234" }).expect(200);
    await http().post("/v1/auth/staff/mfa").set(ua).send({ mfaToken: step1.body.mfaToken, code: "000000" }).expect(401);
    const login = await http().post("/v1/auth/staff/mfa").set(ua).send({ mfaToken: step1.body.mfaToken, code: "123456" }).expect(200);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    await http().post("/v1/auth/staff/logout").set("cookie", cookie).set(ua).expect(204);

    const phone = `97${String(Date.now()).slice(-8)}`;
    await http().post("/v1/auth/otp/send").send({ phone }).expect(200);
    await http().post("/v1/auth/otp/verify").send({ phone, code: "999999", as: "customer" }).expect(400);
    await http().post("/v1/auth/otp/verify").send({ phone, code: "123456", name: "History Customer", as: "customer" }).expect(200);

    await http().get("/v1/admin/sign-ins").set(as("sales")).expect(403);
    const staff = await http().get("/v1/admin/sign-ins").query({ audience: "staff", q: "sales@demo.in" }).set(as("admin")).expect(200);
    const kinds = staff.body.events.slice(0, 4).map((e: { event: string; detail: string | null }) => `${e.event}:${e.detail ?? ""}`);
    expect(kinds).toEqual(["sign_out:", "sign_in:", "sign_in_failed:Wrong authenticator code", "sign_in_failed:Wrong email or password"]);
    expect(staff.body.events[0]).toMatchObject({ userName: "Riya Sharma", audience: "staff", userAgent: ua["user-agent"] });
    expect(staff.body.events[0].ip).toBeTruthy();

    const customer = await http().get("/v1/admin/sign-ins").query({ q: phone }).set(as("admin")).expect(200);
    expect(customer.body.events.map((e: { event: string; detail: string | null }) => `${e.event}:${e.detail}`)).toEqual(["sign_in:New account", "sign_in_failed:Wrong or expired code"]);
    expect(customer.body.last24h.signIns).toBeGreaterThan(0);
    expect(customer.body.last24h.failed).toBeGreaterThan(0);

    const failedOnly = await http().get("/v1/admin/sign-ins").query({ event: "sign_in_failed" }).set(as("admin")).expect(200);
    expect(failedOnly.body.events.every((e: { event: string }) => e.event === "sign_in_failed")).toBe(true);
  });
});
