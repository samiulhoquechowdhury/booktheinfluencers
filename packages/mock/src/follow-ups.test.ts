import { beforeEach, describe, expect, it } from "vitest";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { createFollowUp, followUpsFor, myFollowUps, nextFollowUpAt, updateFollowUp } from "./follow-ups";
import type { MockDb } from "./types";

const sales = STAFF_USERS.find((s) => s.roles.includes("SALES"))!;
let db: MockDb;
beforeEach(() => {
  db = buildSeed();
});

describe("mock follow-ups", () => {
  it("sets, lists, completes and badges follow-ups", () => {
    const lead = db.leads[0]!;
    const dueAt = new Date(Date.now() + 3_600_000).toISOString();
    expect(() => createFollowUp(db, sales, lead.id, { title: "x", dueAt })).toThrow();
    const f = createFollowUp(db, sales, lead.id, { title: "Call back", dueAt, assigneeId: sales.id });
    expect(myFollowUps(db, sales).map((x) => x.id)).toContain(f.id);
    expect(nextFollowUpAt(db, lead.id)).toBe(dueAt);
    updateFollowUp(db, sales, f.id, { done: true });
    expect(myFollowUps(db, sales)).toHaveLength(0);
    expect(followUpsFor(db, lead.id)[0]!.doneAt).toBeTruthy();
    expect(nextFollowUpAt(db, lead.id)).toBeNull();
    expect(db.activities.filter((a) => a.leadId === lead.id && a.title.startsWith("Follow-up")).map((a) => a.title)).toEqual(["Follow-up set: Call back", "Follow-up done: Call back"]);
  });
});
