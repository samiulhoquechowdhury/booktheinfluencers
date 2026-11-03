import { describe, expect, it } from "vitest";
import { OFF_TOPIC_REPLY, eventTypeIn } from "@repo/schemas";
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

  it("keeps answering with Grok turned off, and only the super admin can change it", () => {
    const db = buildSeed();
    expect(assistantStatus(db).ai).toBe(false);
    expect(() => saveAssistantSettings(db, sales, { apiKey: "xai-a-demo-key-0123456789", model: "grok-4.7", enabled: true })).toThrow();
    saveAssistantSettings(db, admin, { apiKey: "xai-a-demo-key-0123456789", model: "grok-4.7", enabled: true });
    expect(assistantStatus(db).ai).toBe(true);
    saveAssistantSettings(db, admin, { model: "grok-4.7", enabled: false });
    expect(assistantStatus(db).ai).toBe(false);
    expect(ask(db, "hello").declined).toBe(false);
    removeAssistantKey(db, admin);
    expect(assistantStatus(db).ai).toBe(false);
  });

  it("starts a brief when the customer wants to book, with the artist only if they're free", () => {
    const db = buildSeed();
    expect(ask(db, `book meera iyer for my wedding on ${FUTURE} in mumbai`).booking).toEqual({ talentSlugs: ["meera-iyer"], date: FUTURE, city: "Mumbai", eventType: "Wedding", budgetBand: null });
    db.calendar["meera-iyer"] = [{ date: FUTURE, source: "artist", note: null, bookingId: null }];
    expect(ask(db, `book meera iyer on ${FUTURE}`).booking?.talentSlugs).toEqual([]);
    expect(ask(db, "is meera iyer free?").booking).toBeNull();
    expect(ask(db, "how does booking work?").booking).toBeNull();
  });

  it("picks the event type out of the message", () => {
    expect(eventTypeIn("a dj for our brand launch")).toBe("Brand launch");
    expect(eventTypeIn("sangeet night")).toBe("Sangeet");
    expect(eventTypeIn("a singer please")).toBeNull();
  });
});
