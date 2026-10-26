import { beforeEach, describe, expect, it } from "vitest";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { draftQuote } from "./staff";
import { addRep, allTalentRecords, createTalent, setRateCard, setRepVerification, setTalentStatus, talentDetail, updateTalent } from "./talent-admin";
import type { MockDb } from "./types";

const staff = (role: string) => STAFF_USERS.find((s) => s.roles.includes(role as never))!;
const manager = staff("TALENT_MANAGER");
const sales = staff("SALES");
const accounts = staff("ACCOUNTS");

const profile = (stageName: string) => ({
  stageName,
  headline: "Sufi and Bollywood live act",
  bio: "A versatile live act playing weddings and corporate nights across India.",
  baseCity: "Pune",
  travelsTo: [],
  languages: ["Hindi"],
  eventTypes: ["Wedding"],
  tags: [],
  categories: ["singers"],
  tier: "STANDARD",
  representationType: "AGENCY_MANAGED",
  featured: false,
  feeBandMinPaise: null,
  feeBandMaxPaise: null,
  photoUrl: "https://images.example.com/a.jpg",
  galleryUrls: [],
});

let db: MockDb;
beforeEach(() => {
  db = buildSeed();
});

describe("mock talent management", () => {
  it("creates drafts that publish only with a verified rep, and hides them when it's revoked", () => {
    const { slug } = createTalent(db, manager, profile("Noor Band"));
    expect(slug).toBe("noor-band");
    expect(createTalent(db, manager, profile("Noor Band")).slug).toBe("noor-band-2");
    expect(() => setTalentStatus(db, manager, slug, "PUBLISHED")).toThrow(/representative/);

    addRep(db, manager, slug, { name: "Asha", phone: "9876500001" });
    const repId = talentDetail(db, manager, slug).reps[0]!.id;
    setRepVerification(db, manager, repId, "VERIFIED");
    setTalentStatus(db, manager, slug, "PUBLISHED");
    expect(talentDetail(db, manager, slug).status).toBe("PUBLISHED");

    setRepVerification(db, manager, repId, "REJECTED");
    expect(talentDetail(db, manager, slug).status).toBe("HIDDEN");
    expect(db.audit.filter((a) => a.entityId === slug).map((a) => a.action)).toEqual(["talent.create", "talent.addRep", "talent.repVerification", "talent.status", "talent.status", "talent.repVerification"]);
  });

  it("edits seed talents in place and validates input", () => {
    const seeded = allTalentRecords(db).find((t) => t.status === "PUBLISHED")!;
    updateTalent(db, manager, seeded.slug, { ...profile(seeded.stageName), baseCity: "Goa" });
    expect(talentDetail(db, manager, seeded.slug).baseCity).toBe("Goa");
    expect(() => updateTalent(db, manager, seeded.slug, { ...profile("X"), stageName: "" })).toThrow(/stage name/);
    expect(() => createTalent(db, sales, profile("Sales Act"))).toThrow(/role/);
  });

  it("uses edited rate cards for quote drafts and hides them from roles without access", () => {
    const booking = db.bookings[0]!;
    expect(() => setRateCard(db, sales, booking.talentSlug, { sellingRatePaise: "100", minimumRatePaise: "50", payoutBps: 8000 })).toThrow(/role/);
    setRateCard(db, accounts, booking.talentSlug, { sellingRatePaise: "50000000", minimumRatePaise: "40000000", payoutBps: 8000 });
    expect(draftQuote(structuredClone(db), booking.id).rate.minimumRatePaise).toBe("40000000");
    expect(talentDetail(db, staff("OPS"), booking.talentSlug).rateCard).toBeNull();
  });
});
