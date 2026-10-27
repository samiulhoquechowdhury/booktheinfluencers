import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (role: string) => ({ authorization: `Bearer ${tokens[role]}` });

beforeAll(async () => {
  ({ app, db, http } = await startApp());
  for (const role of ["sales", "ops"]) tokens[role] = await signInStaff(app, `${role}@demo.in`);
});
afterAll(async () => {
  await app?.close();
});

describe("follow-ups", () => {
  it("sets, lists, snoozes and completes follow-ups, noting them on the lead", async () => {
    const lead = await db.lead.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const sales = await db.user.findFirstOrThrow({ where: { email: "sales@demo.in" } });
    const dueAt = new Date(Date.now() - 60_000).toISOString();

    await http().post(`/v1/admin/leads/${lead.id}/follow-ups`).set(as("sales")).send({ title: "x", dueAt }).expect(400);
    await http().post(`/v1/admin/leads/${lead.id}/follow-ups`).set(as("sales")).send({ title: "Call back", dueAt, assigneeId: "nobody" }).expect(400);
    const created = await http().post(`/v1/admin/leads/${lead.id}/follow-ups`).set(as("ops")).send({ title: "Call back about the date", dueAt, assigneeId: sales.id, note: "Prefers mornings" }).expect(201);
    expect(created.body).toMatchObject({ leadRef: lead.ref, assigneeName: "Riya Sharma", createdByName: "Dev Patel", doneAt: null });

    const mine = await http().get("/v1/admin/follow-ups/mine").set(as("sales")).expect(200);
    expect(mine.body.some((f: { id: string }) => f.id === created.body.id)).toBe(true);
    const leads = await http().get("/v1/admin/leads").set(as("sales")).expect(200);
    expect(leads.body.find((l: { id: string }) => l.id === lead.id).nextFollowUpAt).toBeTruthy();

    await db.followUp.update({ where: { id: created.body.id }, data: { reminderSentAt: new Date() } });
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const snoozed = await http().patch(`/v1/admin/follow-ups/${created.body.id}`).set(as("sales")).send({ dueAt: later }).expect(200);
    expect(snoozed.body.dueAt).toBe(later);
    expect((await db.followUp.findUniqueOrThrow({ where: { id: created.body.id } })).reminderSentAt).toBeNull(); // re-armed

    await http().patch(`/v1/admin/follow-ups/${created.body.id}`).set(as("sales")).send({}).expect(400);
    const done = await http().patch(`/v1/admin/follow-ups/${created.body.id}`).set(as("sales")).send({ done: true }).expect(200);
    expect(done.body.doneAt).toBeTruthy();
    const after = await http().get("/v1/admin/follow-ups/mine").set(as("sales")).expect(200);
    expect(after.body.some((f: { id: string }) => f.id === created.body.id)).toBe(false);

    const list = await http().get(`/v1/admin/leads/${lead.id}/follow-ups`).set(as("sales")).expect(200);
    expect(list.body.find((f: { id: string }) => f.id === created.body.id).doneAt).toBeTruthy();
    const timeline = await db.activity.findMany({ where: { leadId: lead.id, title: { startsWith: "Follow-up" } }, orderBy: { createdAt: "desc" }, take: 2 });
    expect(timeline.map((a) => a.title)).toEqual(["Follow-up done: Call back about the date", "Follow-up set: Call back about the date"]);
    expect(timeline.every((a) => a.internal)).toBe(true);
  });
});
