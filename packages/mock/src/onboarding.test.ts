import { beforeEach, describe, expect, it } from "vitest";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { addOnboardingDocument, approveArtist, ensureOnboardingDraft, onboardingState, rejectArtist, saveOnboarding, staffDocumentUrl, submitOnboarding, verificationDetail, verificationQueue } from "./onboarding";
import { allTalentRecords } from "./talent-admin";
import type { MockDb, UserRec } from "./types";

const manager = STAFF_USERS.find((s) => s.roles.includes("TALENT_MANAGER"))!;
const sales = STAFF_USERS.find((s) => s.roles.includes("SALES"))!;
const profile = {
  legalName: "Riya Sen",
  stageName: "Riya Live",
  headline: "Sufi singer",
  bio: "A versatile live act playing weddings across India.",
  baseCity: "Pune",
  categories: ["singers"],
  languages: ["Hindi"],
  eventTypes: [],
  travelsTo: [],
  feeFromRupees: "",
  feeToRupees: "",
  photoUrl: "data:image/jpeg;base64,AAAA",
  galleryUrls: [],
  socialLinks: { instagram: "https://instagram.com/riya" },
};

let db: MockDb;
let slug: string;
beforeEach(() => {
  db = buildSeed();
  const user: UserRec = { id: "usr_new", phone: "9812345678", name: "New artist", email: null, roles: ["TALENT"], talentSlug: null, createdAt: new Date().toISOString() };
  db.users.push(user);
  ensureOnboardingDraft(db, user);
  slug = user.talentSlug!;
});

describe("mock onboarding", () => {
  it("runs from a draft through review to verified", () => {
    expect(onboardingState(db, slug).status).toBe("INCOMPLETE");
    expect(() => submitOnboarding(db, slug)).toThrow(/Still needed/);
    saveOnboarding(db, slug, profile);
    expect(() => submitOnboarding(db, slug)).toThrow(/government ID/);
    const doc = addOnboardingDocument(db, slug, "AADHAAR", { fileName: "a.pdf", mime: "application/pdf", size: 100, dataUrl: "data:application/pdf;base64,AA==" });
    expect(submitOnboarding(db, slug)).toMatchObject({ status: "SUBMITTED", editable: false });
    expect(() => saveOnboarding(db, slug, profile)).toThrow(/reviewed/);
    expect(db.users.find((u) => u.id === "usr_new")?.name).toBe("Riya Live");

    expect(() => verificationQueue(db, sales)).toThrow(/talent managers/);
    expect(verificationQueue(db, manager).map((r) => r.slug)).toEqual([slug]);
    expect(verificationDetail(db, manager, slug).documents[0]).not.toHaveProperty("dataUrl");
    staffDocumentUrl(db, manager, doc.id);
    expect(db.audit.some((a) => a.action === "talent.documentViewed")).toBe(true);

    rejectArtist(db, manager, slug, { reason: "The name doesn't match." });
    expect(onboardingState(db, slug)).toMatchObject({ status: "REJECTED", reviewNote: "The name doesn't match.", editable: true });
    submitOnboarding(db, slug);
    approveArtist(db, manager, slug);
    expect(onboardingState(db, slug)).toMatchObject({ status: "APPROVED", live: true });
    expect(allTalentRecords(db).find((t) => t.slug === slug)).toMatchObject({ status: "PUBLISHED", reps: [{ verification: "VERIFIED" }] });
  });

  it("treats seeded artists as already approved", () => {
    expect(onboardingState(db, "aanya-kapoor")).toMatchObject({ status: "APPROVED", editable: false });
  });
});
