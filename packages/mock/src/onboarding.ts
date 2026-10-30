import {
  OnboardingProfileSchema,
  ReviewRejectSchema,
  onboardingMissing,
  type IdDocumentType,
  type OnboardingDocument,
  type OnboardingProfile,
  type OnboardingState,
  type ReviewStatus,
  type VerificationDetail,
  type VerificationRow,
} from "@repo/schemas";
import { CATEGORIES } from "./catalogue/data";
import type { StaffUser } from "./internal";
import { ApiError, newId, nowIso } from "./server";
import { audit, can } from "./staff";
import { talentRecord } from "./talent-admin";
import type { MockDb, OnboardingRec, UserRec } from "./types";

// Artist onboarding for the in-browser mock. Mirrors apps/api (talent/onboarding, verifications). ID files are data
// URLs in localStorage here, so they're capped small; the demo's public site is static and won't show new artists.

export const DEMO_MAX_DOCUMENT_BYTES = 1_500_000;

const emptyProfile = (): OnboardingProfile => ({
  legalName: "",
  stageName: "",
  headline: "",
  bio: "",
  baseCity: "",
  categories: [],
  languages: [],
  eventTypes: [],
  travelsTo: [],
  feeFromRupees: "",
  feeToRupees: "",
  photoUrl: "",
  galleryUrls: [],
  socialLinks: {},
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "artist";

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!result.success) throw new ApiError("VALIDATION", result.error.issues[0]?.message ?? "Please check the form");
  return result.data;
}

/** New talent sign-in: a private draft to fill in. */
export function ensureOnboardingDraft(db: MockDb, user: UserRec) {
  if (user.talentSlug) return;
  const slug = newId("artist").replace("_", "-");
  user.talentSlug = slug;
  db.onboarding[slug] = { userId: user.id, status: "INCOMPLETE", reviewNote: null, submittedAt: null, reviewedAt: null, reviewedByName: null, profile: { ...emptyProfile(), stageName: user.name === "New artist" ? "" : user.name }, documents: [], createdAt: nowIso() };
}

const publicDoc = ({ dataUrl: _, ...d }: OnboardingRec["documents"][number]): OnboardingDocument => d;

export function onboardingState(db: MockDb, slug: string): OnboardingState {
  const rec = db.onboarding[slug];
  if (!rec) {
    // Seeded and staff-created artists have no review of their own.
    const t = talentRecord(db, slug);
    return { status: "APPROVED", reviewNote: null, submittedAt: null, reviewedAt: null, slug, live: t?.status === "PUBLISHED", editable: false, profile: { ...emptyProfile(), stageName: t?.stageName ?? "", headline: t?.headline ?? "", bio: t?.bio ?? "", baseCity: t?.baseCity ?? "", languages: t?.languages ?? [], photoUrl: t?.photoUrl ?? "" }, documents: [], missing: [] };
  }
  return {
    status: rec.status,
    reviewNote: rec.reviewNote,
    submittedAt: rec.submittedAt,
    reviewedAt: rec.reviewedAt,
    slug,
    live: rec.status === "APPROVED",
    editable: rec.status === "INCOMPLETE" || rec.status === "REJECTED",
    profile: rec.profile,
    documents: rec.documents.map(publicDoc),
    missing: onboardingMissing(rec.profile, rec.documents.length),
  };
}

function editable(db: MockDb, slug: string) {
  const rec = db.onboarding[slug];
  if (!rec || rec.status === "APPROVED") throw new ApiError("APPROVED", "Your profile is verified. Ask your manager to change it.");
  if (rec.status === "SUBMITTED") throw new ApiError("IN_REVIEW", "Your profile is being reviewed. You can make changes once it's back.");
  return rec;
}

export function saveOnboarding(db: MockDb, slug: string, raw: unknown) {
  const rec = editable(db, slug);
  rec.profile = parse(OnboardingProfileSchema.safeParse(raw));
  rec.profile.socialLinks = Object.fromEntries(Object.entries(rec.profile.socialLinks).filter(([, url]) => url));
  return onboardingState(db, slug);
}

export function addOnboardingDocument(db: MockDb, slug: string, type: IdDocumentType, file: { fileName: string; mime: string; size: number; dataUrl: string }) {
  const rec = editable(db, slug);
  if (file.size > DEMO_MAX_DOCUMENT_BYTES) throw new ApiError("TOO_LARGE", "In demo mode, files must be 1.5 MB or smaller");
  const doc = { id: newId("doc"), type, ...file, uploadedAt: nowIso() };
  rec.documents.push(doc);
  return publicDoc(doc);
}

export function removeOnboardingDocument(db: MockDb, slug: string, id: string) {
  const rec = editable(db, slug);
  if (!rec.documents.some((d) => d.id === id)) throw new ApiError("NOT_FOUND", "Document not found");
  rec.documents = rec.documents.filter((d) => d.id !== id);
}

export function ownDocumentUrl(db: MockDb, slug: string, id: string) {
  const doc = db.onboarding[slug]?.documents.find((d) => d.id === id);
  if (!doc) throw new ApiError("NOT_FOUND", "Document not found");
  return doc.dataUrl;
}

export function submitOnboarding(db: MockDb, slug: string) {
  const rec = editable(db, slug);
  const missing = onboardingMissing(rec.profile, rec.documents.length);
  if (missing.length) throw new ApiError("INCOMPLETE", `Still needed: ${missing.map((m) => m.label).join(", ")}`);
  rec.status = "SUBMITTED";
  rec.submittedAt = nowIso();
  rec.reviewNote = null;
  const user = db.users.find((u) => u.id === rec.userId);
  if (user?.name === "New artist") user.name = rec.profile.stageName;
  return onboardingState(db, slug);
}

// ---------- Staff: CRM → Verifications ----------

function requireManager(actor: StaffUser) {
  if (!can(actor, "TALENT_MANAGER")) throw new ApiError("FORBIDDEN", "Only talent managers verify artists");
}

function toRow(db: MockDb, slug: string, rec: OnboardingRec): VerificationRow {
  const user = db.users.find((u) => u.id === rec.userId);
  return { slug, stageName: rec.profile.stageName, legalName: rec.profile.legalName || null, phone: user?.phone ?? null, baseCity: rec.profile.baseCity, photoUrl: rec.profile.photoUrl, status: rec.status, submittedAt: rec.submittedAt, reviewedAt: rec.reviewedAt, documentCount: rec.documents.length };
}

export function verificationQueue(db: MockDb, actor: StaffUser) {
  requireManager(actor);
  const order: Record<ReviewStatus, number> = { SUBMITTED: 0, REJECTED: 1, APPROVED: 2, INCOMPLETE: 3 };
  return Object.entries(db.onboarding)
    .filter(([, r]) => r.status !== "INCOMPLETE")
    .map(([slug, r]) => toRow(db, slug, r))
    .toSorted((a, b) => order[a.status] - order[b.status] || (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
}

function mustRec(db: MockDb, slug: string) {
  const rec = db.onboarding[slug];
  if (!rec) throw new ApiError("NOT_FOUND", "Artist not found");
  return rec;
}

export function verificationDetail(db: MockDb, actor: StaffUser, slug: string): VerificationDetail {
  requireManager(actor);
  const rec = mustRec(db, slug);
  const p = rec.profile;
  const user = db.users.find((u) => u.id === rec.userId);
  return {
    ...toRow(db, slug, rec),
    headline: p.headline,
    bio: p.bio,
    categories: p.categories.map((c) => CATEGORIES.find((x) => x.slug === c)?.name ?? c),
    languages: p.languages,
    eventTypes: p.eventTypes,
    travelsTo: p.travelsTo,
    feeBandMinPaise: p.feeFromRupees ? String(BigInt(p.feeFromRupees) * 100n) : null,
    feeBandMaxPaise: p.feeToRupees ? String(BigInt(p.feeToRupees) * 100n) : null,
    galleryUrls: p.galleryUrls,
    socialLinks: p.socialLinks,
    reviewNote: rec.reviewNote,
    reviewedByName: rec.reviewedByName,
    email: user?.email ?? null,
    documents: rec.documents.map(publicDoc),
    live: rec.status === "APPROVED",
  };
}

export function staffDocumentUrl(db: MockDb, actor: StaffUser, id: string) {
  requireManager(actor);
  for (const [slug, rec] of Object.entries(db.onboarding)) {
    const doc = rec.documents.find((d) => d.id === id);
    if (doc) {
      audit(db, actor, "talent.documentViewed", "Talent", slug, `Viewed ${rec.profile.stageName}'s ${doc.type.toLowerCase().replace("_", " ")}`);
      return { dataUrl: doc.dataUrl, mime: doc.mime };
    }
  }
  throw new ApiError("NOT_FOUND", "Document not found");
}

export function approveArtist(db: MockDb, actor: StaffUser, slug: string) {
  requireManager(actor);
  const rec = mustRec(db, slug);
  if (rec.status !== "SUBMITTED") throw new ApiError("NOT_WAITING", "This artist isn't waiting for review");
  const p = rec.profile;
  const user = db.users.find((u) => u.id === rec.userId);
  rec.status = "APPROVED";
  rec.reviewedAt = nowIso();
  rec.reviewedByName = actor.name;
  // Show them on the CRM roster. The demo's public site is built from static sample data.
  db.talentRecords[slug] = {
    slug,
    status: "PUBLISHED",
    stageName: p.stageName,
    headline: p.headline,
    bio: p.bio,
    baseCity: p.baseCity,
    travelsTo: p.travelsTo,
    languages: p.languages,
    eventTypes: p.eventTypes,
    tags: [],
    categories: p.categories,
    tier: "STANDARD",
    representationType: "TALENT_MANAGED",
    featured: false,
    feeBandMinPaise: p.feeFromRupees ? String(BigInt(p.feeFromRupees) * 100n) : null,
    feeBandMaxPaise: p.feeToRupees ? String(BigInt(p.feeToRupees) * 100n) : null,
    photoUrl: p.photoUrl,
    galleryUrls: p.galleryUrls,
    rateCard: null,
    reps: [{ id: newId("rep"), name: p.legalName || p.stageName, agencyName: null, phone: user?.phone ?? "", email: user?.email ?? null, verification: "VERIFIED" }],
    createdAt: nowIso(),
  };
  audit(db, actor, "talent.approved", "Talent", slug, `Verified ${p.stageName} and published the profile`);
}

export function rejectArtist(db: MockDb, actor: StaffUser, slug: string, raw: unknown) {
  requireManager(actor);
  const { reason } = parse(ReviewRejectSchema.safeParse(raw));
  const rec = mustRec(db, slug);
  if (rec.status !== "SUBMITTED" && rec.status !== "APPROVED") throw new ApiError("NOT_WAITING", "This artist isn't waiting for review");
  rec.status = "REJECTED";
  rec.reviewNote = reason;
  rec.reviewedAt = nowIso();
  rec.reviewedByName = actor.name;
  if (db.talentRecords[slug]) db.talentRecords[slug].status = "HIDDEN";
  audit(db, actor, "talent.rejected", "Talent", slug, `Sent back ${rec.profile.stageName}: ${reason}`);
}

