import { describe, expect, it } from "vitest";
import { OFF_TOPIC_REPLY } from "@repo/schemas";
import { assistantChat, assistantStatus, dateIn, removeAssistantKey, saveAssistantSettings, testAssistant } from "./assistant";
import { buildSeed } from "./seed";
import type { StaffUser } from "./internal";
import type { MockDb } from "./types";

const admin: StaffUser = { id: "stf_admin", name: "Kavya Rao", email: "admin@demo.in", roles: ["SUPER_ADMIN"] };
const sales: StaffUser = { id: "stf_sales", name: "Riya Sharma", email: "sales@demo.in", roles: ["SALES"] };
const ask = (db: MockDb, content: string) => assistantChat(db, { messages: [{ role: "user", content }] });
const FUTURE = "2031-03-10";

describe("demo assistant", () => {
  it("reads dates the way people write them", () => {
    expect(dateIn("is she free on 3 nov?", "2026-10-31")).toBe("2026-11-03");
    expect(dateIn("3rd january please", "2026-10-31")).toBe("2027-01-03");
    expect(dateIn("nov 3 2030", "2026-10-31")).toBe("2030-11-03");
    expect(dateIn("2031-03-10", "2026-10-31")).toBe("2031-03-10");
    expect(dateIn("no date here", "2026-10-31")).toBeNull();
  });

  it("declines questions that aren't about booking", () => {
    const answer = ask(buildSeed(), "what is the capital of france");
    expect(answer).toMatchObject({ reply: OFF_TOPIC_REPLY, declined: true, talents: [] });
  });

  it("says an artist is free, then offers alternatives once they're blocked", () => {
    const db = buildSeed();
    expect(ask(db, `is meera iyer free on ${FUTURE}`).talents[0]).toMatchObject({ slug: "meera-iyer", status: "free" });
    db.calendar["meera-iyer"] = [{ date: FUTURE, source: "artist", note: null, bookingId: null }];
    const { talents } = ask(db, `is meera iyer free on ${FUTURE}`);
    expect(talents[0]).toMatchObject({ slug: "meera-iyer", status: "unavailable" });
    expect(talents.length).toBeGreaterThan(1);
    expect(talents.slice(1).every((t) => t.status === "free")).toBe(true);
  });

  it("never keeps the whole key", () => {
    const db = buildSeed();
    const key = "xai-a-demo-key-0123456789";
    expect(saveAssistantSettings(db, admin, { apiKey: key, model: "grok-4.7", enabled: true }).keyHint).toBe("6789");
    expect(JSON.stringify(db)).not.toContain(key);
    expect(testAssistant(db, admin)).toEqual({ ok: true });
  });

  it("can be turned off, and only by the super admin", () => {
    const db = buildSeed();
    expect(() => saveAssistantSettings(db, sales, { apiKey: "xai-a-demo-key-0123456789", model: "grok-4.7", enabled: true })).toThrow();
    saveAssistantSettings(db, admin, { apiKey: "xai-a-demo-key-0123456789", model: "grok-4.7", enabled: false });
    expect(assistantStatus(db).available).toBe(false);
    expect(() => ask(db, "hello")).toThrow();
    removeAssistantKey(db, admin);
    expect(assistantStatus(db).available).toBe(true);
  });
});
