import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { keysDeep, randomPhone, signInCustomer, signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];

beforeAll(async () => {
  ({ app, db, http } = await startApp());
});
afterAll(async () => {
  await app?.close();
});

/** Invited talent sign in with their phone OTP (seed: Aanya Kapoor is 9800000001). */
async function signInTalent(phone: string) {
  const agent = request(app.getHttpServer());
  await db.otpCode.deleteMany({ where: { phone } }); // tests may sign in more than once inside the resend window
  await agent.post("/v1/auth/otp/send").send({ phone }).expect(200);
  const res = await agent.post("/v1/auth/otp/verify").send({ phone, code: "123456", as: "talent" }).expect(200);
  return { authorization: `Bearer ${res.body.accessToken}` };
}

describe("favourites", () => {
  it("saves, lists and removes", async () => {
    const auth = { authorization: `Bearer ${await signInCustomer(app, randomPhone())}` };
    await http().put("/v1/me/favourites/dj-rhea").set(auth).expect(204);
    await http().put("/v1/me/favourites/dj-rhea").set(auth).expect(204); // idempotent
    await http().put("/v1/me/favourites/nobody").set(auth).expect(404);
    expect((await http().get("/v1/me/favourites").set(auth).expect(200)).body).toEqual(["dj-rhea"]);
    await http().delete("/v1/me/favourites/dj-rhea").set(auth).expect(204);
    expect((await http().get("/v1/me/favourites").set(auth).expect(200)).body).toEqual([]);
  });
});

describe("customer messages and notifications", () => {
  it("round-trips with staff and counts unread", async () => {
    const auth = { authorization: `Bearer ${await signInCustomer(app, randomPhone(), "Chatty")}` };
    const brief = await http()
      .post("/v1/enquiries")
      .set(auth)
      .send({ eventType: "Private party", eventDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), city: "Pune", budgetBand: "under-1l", talentSlugs: [], contactName: "Chatty", phone: "9876533333" })
      .expect(201);
    const leadId = brief.body.leadId;

    await http().post(`/v1/me/leads/${leadId}/messages`).set(auth).send({ body: "  " }).expect(400);
    const sent = await http().post(`/v1/me/leads/${leadId}/messages`).set(auth).send({ body: "Can we add a second set?" }).expect(201);
    expect(sent.body).toMatchObject({ author: "customer", body: "Can we add a second set?" });

    await http().post("/v1/me/notifications/seen").set(auth).expect(204);
    const sales = { authorization: `Bearer ${await signInStaff(app, "sales@demo.in")}` };
    await http().post(`/v1/admin/leads/${leadId}/messages`).set(sales).send({ body: "Yes — I'll add it to the quote." }).expect(201);

    const thread = await http().get(`/v1/me/leads/${leadId}/messages`).set(auth).expect(200);
    expect(thread.body.map((m: { author: string }) => m.author)).toEqual(["customer", "staff"]);
    const notes = await http().get("/v1/me/notifications").set(auth).expect(200);
    expect(notes.body.unread).toBe(1);
    expect(notes.body.items[0].title).toBe("New message from Riya Sharma");
    await http().post("/v1/me/notifications/seen").set(auth).expect(204);
    expect((await http().get("/v1/me/notifications").set(auth).expect(200)).body.unread).toBe(0);

    // First staff reply also gives the lead an owner.
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).ownerId).toBe("stf_sales");

    const stranger = { authorization: `Bearer ${await signInCustomer(app, randomPhone())}` };
    await http().get(`/v1/me/leads/${leadId}/messages`).set(stranger).expect(404);
  });
});

describe("talent portal", () => {
  it("shows the artist's own bookings with payout only", async () => {
    const auth = await signInTalent("9800000001");
    const list = await http().get("/v1/talent/bookings").set(auth).expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    const keys = keysDeep(list.body);
    for (const forbidden of ["sellingTotalPaise", "totalPaise", "subtotalPaise", "customerAmountPaise", "marginPaise", "internalCostPaise", "budgetMinPaise", "budgetMaxPaise"]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
    const done = list.body.find((b: { completedAt: string | null }) => b.completedAt);
    expect(done).toMatchObject({ payoutStatus: "PAID", payoutPaise: expect.stringMatching(/^\d+$/) });

    // Someone else's booking is invisible.
    const kabir = await db.booking.findFirstOrThrow({ where: { talent: { slug: "kabir-malhotra" } } });
    await http().get(`/v1/talent/bookings/${kabir.id}`).set(auth).expect(404);
  });

  it("messages the team about a booking", async () => {
    const auth = await signInTalent("9800000001");
    const booking = (await http().get("/v1/talent/bookings").set(auth).expect(200)).body[0];
    await http().post(`/v1/talent/bookings/${booking.id}/messages`).set(auth).send({ body: "What time is sound check?" }).expect(201);
    const ops = { authorization: `Bearer ${await signInStaff(app, "ops@demo.in")}` };
    await http().post(`/v1/admin/bookings/${booking.id}/messages`).set(ops).send({ body: "5 pm, venue opens at 4." }).expect(201);
    const thread = await http().get(`/v1/talent/bookings/${booking.id}/messages`).set(auth).expect(200);
    expect(thread.body.slice(-2).map((m: { author: string }) => m.author)).toEqual(["talent", "staff"]);
  });

  it("manages blackout dates but can't clear locked ones", async () => {
    const auth = await signInTalent("9800000001");
    await http().put("/v1/talent/blackouts/2027-03-08").set(auth).expect(204);
    await http().put("/v1/talent/blackouts/2020-01-01").set(auth).expect(400);
    const list = await http().get("/v1/talent/blackouts").set(auth).expect(200);
    expect(list.body.all).toContain("2027-03-08");
    expect(list.body.seeded).toContain("2026-12-31");
    await http().delete("/v1/talent/blackouts/2026-12-31").set(auth).expect(409);
    await http().delete("/v1/talent/blackouts/2027-03-08").set(auth).expect(204);
  });

  it("is closed to customers", async () => {
    const customer = { authorization: `Bearer ${await signInCustomer(app, randomPhone())}` };
    await http().get("/v1/talent/bookings").set(customer).expect(403);
  });
});

describe("public intake and staff inbox", () => {
  it("files contact requests, applications and newsletter sign-ups", async () => {
    const contact = await http().post("/v1/contact").send({ name: "Asha", phone: "9876544444", email: "", topic: "Partnerships", message: "We run a venue in Pune." }).expect(201);
    expect(contact.body.ref).toMatch(/^CR-\d{6}$/);
    await http().post("/v1/contact").send({ name: "A", phone: "12", topic: "x", message: "short" }).expect(400);

    const phone = randomPhone();
    const application = {
      stageName: "The Night Owls",
      category: "Singers",
      city: "Pune",
      phone,
      email: "owls@example.com",
      representation: "I manage my own bookings",
      links: "https://example.com/owls",
      about: "Five-piece band playing retro Bollywood classics.",
    };
    const applied = await http().post("/v1/talent-applications").send(application).expect(201);
    expect(applied.body.ref).toMatch(/^AP-\d{6}$/);
    await http().post("/v1/talent-applications").send(application).expect(409);

    const email = `fan-${phone}@example.com`;
    expect((await http().post("/v1/newsletter").send({ email }).expect(200)).body).toEqual({ alreadySubscribed: false });
    expect((await http().post("/v1/newsletter").send({ email: email.toUpperCase() }).expect(200)).body).toEqual({ alreadySubscribed: true });

    const talentManager = { authorization: `Bearer ${await signInStaff(app, "talent@demo.in")}` };
    const inbox = await http().get("/v1/admin/inbox").set(talentManager).expect(200);
    expect(inbox.body.contactRequests.map((r: { ref: string }) => r.ref)).toContain(contact.body.ref);
    const app_ = inbox.body.applications.find((a: { ref: string }) => a.ref === applied.body.ref);
    expect(inbox.body.newsletter.map((n: { email: string }) => n.email)).toContain(email);

    const sales = { authorization: `Bearer ${await signInStaff(app, "sales@demo.in")}` };
    await http().post(`/v1/admin/applications/${app_.id}/status`).set(sales).send({ status: "INVITED" }).expect(403);
    await http().post(`/v1/admin/applications/${app_.id}/status`).set(talentManager).send({ status: "INVITED" }).expect(204);
    expect((await db.talentApplication.findUniqueOrThrow({ where: { id: app_.id } })).status).toBe("INVITED");
  });
});
