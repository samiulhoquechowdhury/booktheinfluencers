import type { INestApplication } from "@nestjs/common";
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
  for (const role of ["admin", "sales", "talent", "ops", "accounts"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
  tokens.customer = await signInCustomer(app, randomPhone(), "Staff Flow Customer");
});
afterAll(async () => {
  await app?.close();
});

async function newLead(slug: string, city = "Mumbai") {
  const res = await http()
    .post("/v1/enquiries")
    .set(as("customer"))
    .send({ eventType: "Corporate event", eventDate: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10), city, budgetBand: "1l-3l", talentSlugs: [slug], contactName: "Staff Flow Customer", phone: "9876522222" })
    .expect(201);
  const lead = await db.lead.findUniqueOrThrow({ where: { id: res.body.leadId }, include: { bookings: true } });
  return { leadId: lead.id, bookingId: lead.bookings[0]!.id };
}

const act = (role: string, bookingId: string, action: string, note?: string) =>
  http().post(`/v1/admin/bookings/${bookingId}/actions`).set(as(role)).send({ action, note });

describe("staff access", () => {
  it("keeps customers out of the CRM", async () => {
    await http().get("/v1/admin/leads").set(as("customer")).expect(403);
    await http().get("/v1/admin/leads").expect(401);
  });

  it("lists leads and shows finance figures to accounts only", async () => {
    const leads = await http().get("/v1/admin/leads").set(as("sales")).expect(200);
    expect(leads.body.length).toBeGreaterThanOrEqual(3);
    const sales = await http().get("/v1/admin/analytics").set(as("sales")).expect(200);
    expect(sales.body.finance).toBeNull();
    const accounts = await http().get("/v1/admin/analytics").set(as("accounts")).expect(200);
    expect(accounts.body.finance.marginPaise).toMatch(/^\d+$/);
    await http().get("/v1/admin/payouts").set(as("sales")).expect(403);
    await http().get("/v1/admin/audit").set(as("sales")).expect(403);
  });

  it("hides margin from non-finance staff in the lead workspace", async () => {
    const confirmed = await db.booking.findFirstOrThrow({ where: { availability: "CONFIRMED" } });
    const sales = await http().get(`/v1/admin/leads/${confirmed.leadId}`).set(as("sales")).expect(200);
    expect(sales.body.bookings.find((b: { id: string }) => b.id === confirmed.id).marginPaise).toBeNull();
    const admin = await http().get(`/v1/admin/leads/${confirmed.leadId}`).set(as("admin")).expect(200);
    expect(admin.body.bookings.find((b: { id: string }) => b.id === confirmed.id).marginPaise).toMatch(/^\d+$/);
  });
});

describe("staff booking flow", () => {
  it("runs a lead from brief to confirmed with each role doing its part", async () => {
    const { leadId, bookingId } = await newLead("vikram-rao", "Hyderabad");

    await act("ops", bookingId, "startAvailabilityCheck").expect(403); // wrong role
    await act("sales", bookingId, "startAvailabilityCheck").expect(204);
    await act("talent", bookingId, "markAvailable").expect(204);
    await act("sales", bookingId, "recordRepAcceptance").expect(403);
    await act("talent", bookingId, "recordRepAcceptance").expect(204);

    const draft = await http().get(`/v1/admin/bookings/${bookingId}/quote-draft`).set(as("sales")).expect(200);
    expect(draft.body.lines[0]).toMatchObject({ type: "TALENT_FEE" });
    const created = await http().post(`/v1/admin/bookings/${bookingId}/quotes`).set(as("sales")).send(draft.body).expect(201);
    expect(created.body.status).toBe("SENT");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe("QUOTE_SENT");

    await http().post(`/v1/quotes/${created.body.id}/accept`).set(as("customer")).expect(204);
    await act("sales", bookingId, "sendContract").expect(204);
    const contract = await db.contract.findFirstOrThrow({ where: { bookingId } });
    await sendWebhook(app, "esign", { eventId: `evt_staff_sig_${bookingId}`, contractId: contract.id, signedName: "Staff Flow Customer" }).expect(200);

    const advance = await db.paymentMilestone.findFirstOrThrow({ where: { bookingId, isAdvance: true } });
    await http().post(`/v1/admin/milestones/${advance.id}/manual-payment`).set(as("sales")).send({ reference: "UTR123456" }).expect(403);
    await http().post(`/v1/admin/milestones/${advance.id}/manual-payment`).set(as("accounts")).send({ reference: `UTR${bookingId.slice(-8)}` }).expect(204);

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { lead: true } });
    expect(booking.availability).toBe("CONFIRMED");
    expect(booking.lead.stage).toBe("CONFIRMED");

    // Ops completes; accounts pays out → payout record equals the contracted payout (SET-1).
    await act("ops", bookingId, "completeEvent").expect(400); // completion note required
    await act("ops", bookingId, "completeEvent", "Ran on time").expect(204);
    const payout = await db.payout.findUniqueOrThrow({ where: { bookingId } });
    expect(payout.amountPaise).toBe(booking.payoutTotalPaise);
    await act("accounts", bookingId, "markPayoutPaid", "NEFT-778").expect(204);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe("SETTLEMENT"); // balance still due

    const audit = await http().get("/v1/admin/audit").set(as("admin")).expect(200);
    const actions = audit.body.filter((a: { entityId: string }) => a.entityId === booking.lead.ref).map((a: { action: string }) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["booking.startAvailabilityCheck", "booking.markAvailable", "quote.create", "booking.sendContract", "payment.manual", "booking.completeEvent", "booking.markPayoutPaid"]),
    );
  });

  it("holds a discounted quote for super admin approval", async () => {
    const { leadId, bookingId } = await newLead("arjun-sethi", "Delhi NCR");
    await act("sales", bookingId, "startAvailabilityCheck").expect(204);
    await act("talent", bookingId, "markAvailable").expect(204);
    const draft = (await http().get(`/v1/admin/bookings/${bookingId}/quote-draft`).set(as("sales")).expect(200)).body;
    draft.lines[0].customerAmountPaise = String(BigInt(draft.lines[0].customerAmountPaise) / 2n);

    const created = await http().post(`/v1/admin/bookings/${bookingId}/quotes`).set(as("sales")).send(draft).expect(201);
    expect(created.body.status).toBe("PENDING_APPROVAL");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe("AVAILABILITY_CHECK");
    // The customer can't see or accept it yet.
    const view = await http().get(`/v1/me/leads/${leadId}`).set(as("customer")).expect(200);
    expect(view.body.bookings[0].quotes).toHaveLength(0);
    await http().post(`/v1/quotes/${created.body.id}/accept`).set(as("customer")).expect(409);

    await http().post(`/v1/admin/quotes/${created.body.id}/approve`).set(as("sales")).expect(403);
    await http().post(`/v1/admin/quotes/${created.body.id}/approve`).set(as("admin")).expect(204);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe("QUOTE_SENT");
  });

  it("never lets staff move a lead to CONFIRMED and requires reasons", async () => {
    const { leadId, bookingId } = await newLead("dj-rhea", "Goa");
    await act("sales", bookingId, "startAvailabilityCheck").expect(204);
    const confirm = await http().post(`/v1/admin/leads/${leadId}/transition`).set(as("admin")).send({ to: "CONFIRMED" }).expect(409);
    expect(confirm.body.error.code).toBe("INVALID_TRANSITION");
    await http().post(`/v1/admin/leads/${leadId}/transition`).set(as("sales")).send({ to: "LOST" }).expect(409);
    await http().post(`/v1/admin/leads/${leadId}/transition`).set(as("sales")).send({ to: "LOST", reason: "Budget too low" }).expect(204);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).lostReason).toBe("Budget too low");
  });

  it("validates quote drafts", async () => {
    const booking = await db.booking.findFirstOrThrow({ where: { availability: "AVAILABLE" } });
    const res = await http()
      .post(`/v1/admin/bookings/${booking.id}/quotes`)
      .set(as("sales"))
      .send({ lines: [{ type: "TRAVEL", description: "Taxi", customerAmountPaise: "100", internalCostPaise: "0", taxRateBps: 1800 }], validDays: 7, advanceBps: 5000 })
      .expect(400);
    expect(res.body.error.message).toMatch(/artist fee/i);
  });

  it("lets talent managers manage blackouts", async () => {
    await http().post("/v1/admin/talents/kabir-malhotra/blackouts/2027-02-14").set(as("sales")).expect(403);
    await http().post("/v1/admin/talents/kabir-malhotra/blackouts/2027-02-14").set(as("talent")).expect(204);
    const list = await http().get("/v1/admin/talents/kabir-malhotra/blackouts").set(as("talent")).expect(200);
    expect(list.body.all).toContain("2027-02-14");
    const search = await http().get("/v1/talents").query({ date: "2027-02-14", q: "kabir" }).expect(200);
    expect(search.body.meta.total).toBe(0);
    await http().delete("/v1/admin/talents/kabir-malhotra/blackouts/2027-02-14").set(as("talent")).expect(204);
  });
});
