import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { randomPhone, sendWebhook, signInCustomer, signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (role: string) => ({ authorization: `Bearer ${tokens[role]}` });

beforeAll(async () => {
  ({ app, db, http } = await startApp());
  for (const role of ["sales", "talent", "accounts"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
  tokens.customer = await signInCustomer(app, randomPhone(), "Calendar Customer");
});
afterAll(async () => {
  await app?.close();
});

/** A future date no other test (or earlier run) has used. */
const freshDate = () => {
  const d = new Date(Date.UTC(2029 + Math.floor(Math.random() * 20), 0, 1) + Math.floor(Math.random() * 360) * 86_400_000);
  return d.toISOString().slice(0, 10);
};

async function signInTalent(phone: string) {
  const agent = request(app.getHttpServer());
  await db.otpCode.deleteMany({ where: { phone } });
  await agent.post("/v1/auth/otp/send").send({ phone }).expect(200);
  const res = await agent.post("/v1/auth/otp/verify").send({ phone, code: "123456", as: "talent" }).expect(200);
  return { authorization: `Bearer ${res.body.accessToken}` };
}

const enquire = (slugs: string[], eventDate: string, altDate?: string) =>
  http()
    .post("/v1/enquiries")
    .set(as("customer"))
    .send({ eventType: "Wedding", eventDate, altDate, city: "Mumbai", budgetBand: "1l-3l", talentSlugs: slugs, contactName: "Calendar Customer", phone: "9876522222" });

const act = (role: string, bookingId: string, action: string, note?: string) =>
  http().post(`/v1/admin/bookings/${bookingId}/actions`).set(as(role)).send({ action, note });

describe("calendar (AVL-4, TAL-3)", () => {
  it("locks dates the talent team sets, with a note, and keeps them from the artist", async () => {
    const date = freshDate();
    await http().post(`/v1/admin/talents/aanya-kapoor/blackouts/${date}`).set(as("talent")).send({ note: "Family wedding" }).expect(204);
    const cal = await http().get("/v1/admin/talents/aanya-kapoor/blackouts").set(as("sales")).expect(200);
    expect(cal.body.entries).toContainEqual({ date, source: "manager", note: "Family wedding", ref: null, leadId: null });

    const artist = await signInTalent("9800000001");
    await http().delete(`/v1/talent/blackouts/${date}`).set(artist).expect(409);
    await http().delete(`/v1/admin/talents/aanya-kapoor/blackouts/${date}`).set(as("talent")).expect(204);
  });

  it("lets the talent team switch artist self-editing off", async () => {
    const artist = await signInTalent("9800000001");
    await http().put("/v1/admin/talents/aanya-kapoor/calendar").set(as("sales")).send({ selfEdit: false }).expect(403);
    await http().put("/v1/admin/talents/aanya-kapoor/calendar").set(as("talent")).send({ selfEdit: false }).expect(204);
    expect((await http().get("/v1/talent/blackouts").set(artist).expect(200)).body.selfEdit).toBe(false);
    await http().put(`/v1/talent/blackouts/${freshDate()}`).set(artist).expect(403);
    await http().put("/v1/admin/talents/aanya-kapoor/calendar").set(as("talent")).send({ selfEdit: true }).expect(204);
    const date = freshDate();
    await http().put(`/v1/talent/blackouts/${date}`).set(artist).expect(204);
    const cal = await http().get("/v1/talent/blackouts").set(artist).expect(200);
    expect(cal.body.entries).toContainEqual(expect.objectContaining({ date, source: "artist" }));
    await http().delete(`/v1/talent/blackouts/${date}`).set(artist).expect(204);
  });

  it("refuses enquiries and shortlist additions for a blocked date", async () => {
    const date = freshDate();
    await http().post(`/v1/admin/talents/kabir-malhotra/blackouts/${date}`).set(as("talent")).expect(204);
    const refused = await enquire(["kabir-malhotra", "dj-rhea"], date).expect(409);
    expect(refused.body.error).toMatchObject({ code: "DATE_BLOCKED", details: { field: "eventDate", talents: ["Kabir Malhotra"] } });
    expect(refused.body.error.message).toMatch(/^Kabir Malhotra isn't available on/);

    const ok = await enquire(["dj-rhea"], date).expect(201);
    const added = await http().post(`/v1/admin/leads/${ok.body.leadId}/talents`).set(as("sales")).send({ slug: "kabir-malhotra" }).expect(409);
    expect(added.body.error.code).toBe("DATE_BLOCKED");
    await http().delete(`/v1/admin/talents/kabir-malhotra/blackouts/${date}`).set(as("talent")).expect(204);
    await http().post(`/v1/admin/leads/${ok.body.leadId}/talents`).set(as("sales")).send({ slug: "kabir-malhotra" }).expect(204);
  });

  it("shows customers the blocked dates, and nothing about why", async () => {
    const date = freshDate();
    await http().post(`/v1/admin/talents/dj-rhea/blackouts/${date}`).set(as("talent")).send({ note: "Private family matter" }).expect(204);
    const res = await http().get("/v1/talents/dj-rhea/blocked-dates").expect(200);
    expect(res.body.dates).toContain(date);
    expect(JSON.stringify(res.body)).not.toContain("Private family matter");
    await http().get("/v1/talents/nobody-here/blocked-dates").expect(404);
    await http().delete(`/v1/admin/talents/dj-rhea/blackouts/${date}`).set(as("talent")).expect(204);
    expect((await http().get("/v1/talents/dj-rhea/blocked-dates").expect(200)).body.dates).not.toContain(date);
  });

  it("refuses a blocked alternate date too", async () => {
    const [date, alt] = [freshDate(), freshDate()];
    await http().post(`/v1/admin/talents/meera-iyer/blackouts/${alt}`).set(as("talent")).expect(204);
    const refused = await enquire(["meera-iyer"], date, alt).expect(409);
    expect(refused.body.error.code).toBe("DATE_BLOCKED");
    await http().delete(`/v1/admin/talents/meera-iyer/blackouts/${alt}`).set(as("talent")).expect(204);
  });

  it("holds the date once a booking is confirmed and frees it if the booking is cancelled", async () => {
    const date = freshDate();
    const res = await enquire(["vikram-rao"], date).expect(201);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: res.body.leadId }, include: { bookings: true } });
    const bookingId = lead.bookings[0]!.id;
    await act("sales", bookingId, "startAvailabilityCheck").expect(204);
    await act("talent", bookingId, "markAvailable").expect(204);
    await act("talent", bookingId, "recordRepAcceptance").expect(204);
    const draft = await http().get(`/v1/admin/bookings/${bookingId}/quote-draft`).set(as("sales")).expect(200);
    const quote = await http().post(`/v1/admin/bookings/${bookingId}/quotes`).set(as("sales")).send(draft.body).expect(201);
    await http().post(`/v1/quotes/${quote.body.id}/accept`).set(as("customer")).expect(204);
    await act("sales", bookingId, "sendContract").expect(204);
    const contract = await db.contract.findFirstOrThrow({ where: { bookingId } });
    await sendWebhook(app, "esign", { eventId: `evt_cal_${bookingId}`, contractId: contract.id, signedName: "Calendar Customer" }).expect(200);
    const advance = await db.paymentMilestone.findFirstOrThrow({ where: { bookingId, isAdvance: true } });
    await http().post(`/v1/admin/milestones/${advance.id}/manual-payment`).set(as("accounts")).send({ reference: `UTR${bookingId.slice(-8)}` }).expect(204);

    const cal = await http().get("/v1/admin/talents/vikram-rao/blackouts").set(as("talent")).expect(200);
    expect(cal.body.entries).toContainEqual({ date, source: "booking", note: `Booked · ${lead.ref}`, ref: lead.ref, leadId: lead.id });
    expect((await http().get("/v1/talents").query({ date, q: "vikram" })).body.meta.total).toBe(0);
    await enquire(["vikram-rao"], date).expect(409); // no double booking
    await http().delete(`/v1/admin/talents/vikram-rao/blackouts/${date}`).set(as("talent")).expect(409);

    await act("sales", bookingId, "cancelBooking", "Customer called off the event").expect(204);
    const after = await http().get("/v1/admin/talents/vikram-rao/blackouts").set(as("talent")).expect(200);
    expect(after.body.all).not.toContain(date);
  });

  it("gives a contested date to whoever confirms first, and tells the other customer", async () => {
    tokens.other = await signInCustomer(app, randomPhone(), "Second Customer");
    const date = freshDate();

    /** One customer's brief, taken as far as paying the advance. */
    const toAdvance = async (who: string) => {
      const res = await http().post("/v1/enquiries").set(as(who)).send({ eventType: "Wedding", eventDate: date, city: "Mumbai", budgetBand: "1l-3l", talentSlugs: ["arjun-sethi"], contactName: "Contested", phone: "9876522222" }).expect(201);
      const lead = await db.lead.findUniqueOrThrow({ where: { id: res.body.leadId }, include: { bookings: true } });
      const bookingId = lead.bookings[0]!.id;
      await act("sales", bookingId, "startAvailabilityCheck").expect(204);
      await act("talent", bookingId, "markAvailable").expect(204);
      await act("talent", bookingId, "recordRepAcceptance").expect(204);
      const draft = await http().get(`/v1/admin/bookings/${bookingId}/quote-draft`).set(as("sales")).expect(200);
      const quote = await http().post(`/v1/admin/bookings/${bookingId}/quotes`).set(as("sales")).send(draft.body).expect(201);
      await http().post(`/v1/quotes/${quote.body.id}/accept`).set(as(who)).expect(204);
      await act("sales", bookingId, "sendContract").expect(204);
      const contract = await db.contract.findFirstOrThrow({ where: { bookingId } });
      await sendWebhook(app, "esign", { eventId: `evt_race_${bookingId}`, contractId: contract.id, signedName: "Contested" }).expect(200);
      const advance = await db.paymentMilestone.findFirstOrThrow({ where: { bookingId, isAdvance: true } });
      return { leadId: lead.id, bookingId, advance };
    };
    const pay = (advanceId: string) => http().post(`/v1/admin/milestones/${advanceId}/manual-payment`).set(as("accounts")).send({ reference: `UTR${advanceId.slice(-8)}` });

    const first = await toAdvance("customer");
    const second = await toAdvance("other");
    await pay(first.advance.id).expect(204);

    // First is confirmed, and everyone can see the date is booked.
    expect(await db.booking.findUniqueOrThrow({ where: { id: first.bookingId } })).toMatchObject({ availability: "CONFIRMED" });
    const open = await http().get("/v1/talents/arjun-sethi/blocked-dates").expect(200);
    expect(open.body.booked).toContain(date);
    const third = await enquire(["arjun-sethi"], date).expect(409);
    expect(third.body.error.message).toMatch(/^Arjun Sethi is already booked on/);

    // Second is told straight away and can't pay online.
    expect(await db.booking.findUniqueOrThrow({ where: { id: second.bookingId } })).toMatchObject({ availability: "UNAVAILABLE", confirmedAt: null });
    expect(await db.notification.count({ where: { event: "booking.dateTaken", leadId: second.leadId } })).toBeGreaterThan(0);
    const refused = await http().post(`/v1/milestones/${second.advance.id}/checkout`).set(as("other")).expect(409);
    expect(refused.body.error.code).toBe("DATE_TAKEN");

    // Money arriving anyway (a bank transfer) still can't double-book. The team is told to sort it out.
    await pay(second.advance.id).expect(204);
    expect(await db.booking.findUniqueOrThrow({ where: { id: second.bookingId } })).toMatchObject({ availability: "UNAVAILABLE", confirmedAt: null });
    expect(await db.activity.count({ where: { leadId: second.leadId, internal: true, title: { contains: "date already booked" } } })).toBe(1);

    await act("sales", first.bookingId, "cancelBooking", "Test finished").expect(204);
  });

  it("keeps the budget filter when searching by keyword", async () => {
    const all = await http().get("/v1/talents").query({ q: "singer" }).expect(200);
    const capped = await http().get("/v1/talents").query({ q: "singer", budget: "under-1l" }).expect(200);
    expect(capped.body.meta.total).toBeLessThanOrEqual(all.body.meta.total);
    for (const t of capped.body.data) expect(BigInt(t.feeBandMinPaise ?? "0")).toBeLessThanOrEqual(10_000_000n);
  });
});
