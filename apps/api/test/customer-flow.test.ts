import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { keysDeep, randomPhone, sendWebhook, signInCustomer, signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];

beforeAll(async () => {
  ({ app, db, http } = await startApp());
});
afterAll(async () => {
  await app?.close();
});

const inSixtyDays = () => new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

describe("health and catalogue", () => {
  it("reports the database", async () => {
    const res = await http().get("/v1/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });

  it("lists published talent with fee bands only", async () => {
    const res = await http().get("/v1/talents").expect(200);
    expect(res.body.meta.total).toBe(18);
    expect(res.body.data).toHaveLength(12);
    const keys = keysDeep(res.body);
    for (const internal of ["rateCards", "sellingRatePaise", "minimumRatePaise", "payoutBps"]) expect(keys.has(internal)).toBe(false);
  });

  it("applies filters and blackout dates", async () => {
    const comedians = await http().get("/v1/talents").query({ category: "comedians", verified: "1" }).expect(200);
    expect(comedians.body.data.every((t: { categories: string[]; verified: boolean }) => t.categories.includes("comedians") && t.verified)).toBe(true);
    const nye = await http().get("/v1/talents").query({ date: "2026-12-31", q: "aanya" }).expect(200);
    expect(nye.body.meta.total).toBe(0);
  });

  it("serves profiles and 404s unknown slugs", async () => {
    const res = await http().get("/v1/talents/aanya-kapoor").expect(200);
    expect(res.body).toMatchObject({ stageName: "Aanya Kapoor", feeBandMinPaise: "30000000" });
    await http().get("/v1/talents/nobody").expect(404);
  });

  it("rejects bad filter input", async () => {
    const res = await http().get("/v1/talents").query({ sort: "evil" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });
});

describe("customer auth", () => {
  it("requires a session for private routes", async () => {
    await http().get("/v1/me/leads").expect(401);
  });

  it("rejects a wrong code and limits attempts", async () => {
    const phone = randomPhone();
    await http().post("/v1/auth/otp/send").send({ phone }).expect(200);
    const res = await http().post("/v1/auth/otp/verify").send({ phone, code: "000000" }).expect(400);
    expect(res.body.error.code).toBe("OTP_INVALID");
    await http().post("/v1/auth/otp/send").send({ phone }).expect(429); // 30 s resend gap
  });

  it("creates a customer on first verify and sets a refresh cookie", async () => {
    const phone = randomPhone();
    await http().post("/v1/auth/otp/send").send({ phone }).expect(200);
    const res = await http().post("/v1/auth/otp/verify").send({ phone, code: "123456", name: "Asha" }).expect(200);
    expect(res.body.user).toMatchObject({ phone, name: "Asha", roles: ["CUSTOMER"] });
    expect(String(res.headers["set-cookie"])).toMatch(/refresh_token=.*HttpOnly.*SameSite=Strict/i);
    const me = await http().get("/v1/auth/me").set("authorization", `Bearer ${res.body.accessToken}`).expect(200);
    expect(me.body.id).toBe(res.body.user.id);
  });

  it("rotates refresh tokens and revokes everything on reuse", async () => {
    const phone = randomPhone();
    await http().post("/v1/auth/otp/send").send({ phone }).expect(200);
    const login = await http().post("/v1/auth/otp/verify").send({ phone, code: "123456" }).expect(200);
    const first = String(login.headers["set-cookie"]).split(";")[0]!;
    const rotated = await http().post("/v1/auth/refresh").set("cookie", first).expect(200);
    const second = String(rotated.headers["set-cookie"]).split(";")[0]!;
    await http().post("/v1/auth/refresh").set("cookie", first).expect(401); // reuse
    await http().post("/v1/auth/refresh").set("cookie", second).expect(401); // family revoked
  });

  it("keeps talent sign-in invite-only", async () => {
    const phone = randomPhone();
    await http().post("/v1/auth/otp/send").send({ phone }).expect(200);
    const res = await http().post("/v1/auth/otp/verify").send({ phone, code: "123456", as: "talent" }).expect(403);
    expect(res.body.error.code).toBe("NOT_INVITED");
  });
});

describe("staff auth", () => {
  it("needs password and MFA", async () => {
    await http().post("/v1/auth/staff/login").send({ email: "sales@demo.in", password: "wrong" }).expect(401);
    const token = await signInStaff(app, "sales@demo.in");
    const me = await http().get("/v1/auth/me").set("authorization", `Bearer ${token}`).expect(200);
    expect(me.body.roles).toContain("SALES");
  });
});

describe("booking flow", () => {
  it("goes from brief to confirmed only through the four conditions", async () => {
    const token = await signInCustomer(app, randomPhone(), "Flow Tester");
    const auth = { authorization: `Bearer ${token}` };

    const brief = await http()
      .post("/v1/enquiries")
      .set(auth)
      .send({ eventType: "Corporate event", eventDate: inSixtyDays(), city: "Mumbai", budgetBand: "1l-3l", talentSlugs: ["kabir-malhotra"], contactName: "Flow Tester", phone: "9876500000" })
      .expect(201);
    expect(brief.body.ref).toMatch(/^TB-\d{4}-\d{6}$/);

    // Staff side (step 2b adds these endpoints): owner, availability, rep acceptance, quote.
    const lead = await db.lead.findUniqueOrThrow({ where: { id: brief.body.leadId }, include: { bookings: true } });
    const booking = lead.bookings[0]!;
    await db.lead.update({ where: { id: lead.id }, data: { stage: "QUOTE_SENT", ownerId: "stf_sales" } });
    await db.booking.update({ where: { id: booking.id }, data: { availability: "AVAILABLE", repAcceptedAt: new Date() } });
    const quote = await db.quote.create({
      data: {
        bookingId: booking.id,
        version: 1,
        status: "SENT",
        validUntil: new Date(Date.now() + 7 * 86_400_000),
        subtotalPaise: 24_187_500n,
        taxPaise: 4_353_750n,
        totalPaise: 28_541_250n,
        internalCostPaise: 18_000_000n,
        milestonePlan: [{ label: "Advance", percentBps: 5000 }, { label: "Balance", percentBps: 5000 }],
        lineItems: {
          create: [
            { position: 0, type: "TALENT_FEE", description: "Performance fee", customerAmountPaise: 22_500_000n, internalCostPaise: 18_000_000n, taxRateBps: 1800 },
            { position: 1, type: "SERVICE_FEE", description: "Coordination", customerAmountPaise: 1_687_500n, internalCostPaise: 0n, taxRateBps: 1800 },
          ],
        },
      },
    });

    // The customer's view never carries internal figures.
    const view = await http().get(`/v1/me/leads/${lead.id}`).set(auth).expect(200);
    const keys = keysDeep(view.body);
    for (const internal of ["internalCostPaise", "marginPaise", "payoutTotalPaise", "ownerId", "lostReason", "stage"]) expect(keys.has(internal)).toBe(false);
    expect(view.body.manager).toMatchObject({ name: "Riya Sharma" });

    await http().post(`/v1/quotes/${quote.id}/accept`).set(auth).expect(204);
    await http().post(`/v1/quotes/${quote.id}/accept`).set(auth).expect(409);
    const milestones = await db.paymentMilestone.findMany({ where: { bookingId: booking.id }, orderBy: { dueDate: "asc" } });
    expect(milestones.map((m) => m.amountPaise)).toEqual([14_270_625n, 14_270_625n]);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("ADVANCE_PENDING");

    // Balance can't be paid before the contract is signed.
    await http().post(`/v1/milestones/${milestones[1]!.id}/checkout`).set(auth).expect(409);
    const checkout = await http().post(`/v1/milestones/${milestones[0]!.id}/checkout`).set(auth).expect(201);
    expect(checkout.body.checkoutUrl).toBe(`/checkout/${milestones[0]!.id}`);

    // Advance arrives first — still not confirmed without the signature.
    const advance = { eventId: `evt_adv_${booking.id}`, milestoneId: milestones[0]!.id, gatewayPaymentId: `pay_${booking.id}`, amountPaise: "14270625", method: "UPI", status: "captured" };
    await sendWebhook(app, "payments", advance, "deadbeef").expect(401);
    await sendWebhook(app, "payments", advance).expect(200);
    const dupe = await sendWebhook(app, "payments", advance).expect(200);
    expect(dupe.body.duplicate).toBe(true);
    expect(await db.payment.count({ where: { milestoneId: milestones[0]!.id } })).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).availability).toBe("AVAILABLE");

    // Contract signed via the e-sign webhook → all four conditions → CONFIRMED.
    const contract = await db.contract.create({ data: { bookingId: booking.id, status: "SENT", sentAt: new Date() } });
    await sendWebhook(app, "esign", { eventId: `evt_sig_${booking.id}`, contractId: contract.id, signedName: "Flow Tester" }).expect(200);
    const confirmed = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { lead: true } });
    expect(confirmed.availability).toBe("CONFIRMED");
    expect(confirmed.lead.stage).toBe("CONFIRMED");
    expect(confirmed.sellingTotalPaise).toBe(28_541_250n);
    expect(confirmed.marginPaise).toBe(6_187_500n);

    const after = await http().get(`/v1/me/leads/${lead.id}`).set(auth).expect(200);
    expect(after.body.bookings[0].milestones[0]).toMatchObject({ status: "PAID", paymentRef: `pay_${booking.id}` });
    expect(after.body.timeline.map((t: { title: string }) => t.title)).toContain("Kabir Malhotra is confirmed");
  });

  it("ignores a payment for the wrong amount", async () => {
    const m = await db.paymentMilestone.findFirstOrThrow({ where: { status: { not: "PAID" }, isAdvance: false } });
    await sendWebhook(app, "payments", { eventId: `evt_short_${m.id}`, milestoneId: m.id, gatewayPaymentId: `pay_short_${m.id}`, amountPaise: "1", method: "UPI", status: "captured" }).expect(200);
    expect((await db.paymentMilestone.findUniqueOrThrow({ where: { id: m.id } })).status).not.toBe("PAID");
  });

  it("hides other customers' bookings", async () => {
    const stranger = await signInCustomer(app, randomPhone(), "Stranger");
    const demoLead = await db.lead.findFirstOrThrow({ where: { customerId: "usr_demo_customer" } });
    await http().get(`/v1/me/leads/${demoLead.id}`).set("authorization", `Bearer ${stranger}`).expect(404);
    const quote = await db.quote.findFirstOrThrow({ where: { status: "SENT" } });
    await http().post(`/v1/quotes/${quote.id}/accept`).set("authorization", `Bearer ${stranger}`).expect(404);
  });

  it("refuses an expired quote", async () => {
    const token = await signInCustomer(app, randomPhone(), "Late");
    const brief = await http()
      .post("/v1/enquiries")
      .set("authorization", `Bearer ${token}`)
      .send({ eventType: "Wedding", eventDate: inSixtyDays(), city: "Jaipur", budgetBand: "5l-15l", talentSlugs: ["rahul-khanna"], contactName: "Late", phone: "9876511111" })
      .expect(201);
    const booking = await db.booking.findFirstOrThrow({ where: { leadId: brief.body.leadId } });
    const quote = await db.quote.create({
      data: { bookingId: booking.id, version: 1, status: "SENT", validUntil: new Date(Date.now() - 1000), subtotalPaise: 1n, taxPaise: 0n, totalPaise: 1n, internalCostPaise: 0n, milestonePlan: [{ label: "Advance", percentBps: 10000 }] },
    });
    const res = await http().post(`/v1/quotes/${quote.id}/accept`).set("authorization", `Bearer ${token}`).expect(409);
    expect(res.body.error.code).toBe("QUOTE_EXPIRED");
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("EXPIRED");
  });

  it("validates the brief with the shared schema", async () => {
    const token = await signInCustomer(app, randomPhone());
    const res = await http().post("/v1/enquiries").set("authorization", `Bearer ${token}`).send({ eventType: "", phone: "12" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(["eventType", "phone"]));
  });
});
