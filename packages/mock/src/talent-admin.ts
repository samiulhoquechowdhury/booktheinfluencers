import {
  RateCardSchema,
  RepSchema,
  TalentInputSchema,
  publishBlockers,
  type ProfileStatus,
  type TalentAdminDetail,
  type VerificationStatus,
} from "@repo/schemas";
import { TALENTS } from "./catalogue/data";
import { internalFor, minimumRateFor, type StaffRole, type StaffUser } from "./internal";
import { ApiError, newId, nowIso } from "./server";
import { audit, can } from "./staff";
import type { MockDb, TalentRecord } from "./types";

// ADM-1…5 for the in-browser mock. Mirrors apps/api/src/talents: same schemas, same rules, same audit entries.
// Seed talents are materialised into db.talentRecords the first time staff change them.

function fromSeed(slug: string): TalentRecord | null {
  const t = TALENTS.find((x) => x.slug === slug);
  if (!t) return null;
  const internal = internalFor(slug);
  return {
    slug,
    status: "PUBLISHED",
    stageName: t.stageName,
    headline: t.headline,
    bio: t.bio,
    baseCity: t.baseCity,
    travelsTo: t.travelsTo,
    languages: t.languages,
    eventTypes: t.eventTypes,
    tags: t.tags,
    categories: t.categories,
    tier: t.tier,
    representationType: t.representationType,
    featured: t.featured,
    feeBandMinPaise: t.feeBandMinPaise,
    feeBandMaxPaise: t.feeBandMaxPaise,
    photoUrl: t.photo,
    galleryUrls: t.gallery,
    rateCard: { sellingRatePaise: String(internal.sellingRatePaise), minimumRatePaise: String(minimumRateFor(slug)), payoutBps: internal.payoutBps },
    reps: [{ id: `rep_${slug}`, name: internal.repName, agencyName: null, phone: "9000000000", email: null, verification: t.verified ? "VERIFIED" : "PENDING" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

export const talentRecord = (db: MockDb, slug: string) => db.talentRecords[slug] ?? fromSeed(slug);

export function allTalentRecords(db: MockDb): TalentRecord[] {
  const slugs = [...new Set([...TALENTS.map((t) => t.slug), ...Object.keys(db.talentRecords)])];
  return slugs.map((slug) => talentRecord(db, slug)!).toSorted((a, b) => a.stageName.localeCompare(b.stageName));
}

/** The rate card quotes are drafted from: admin edits win over the seed. */
export function rateCardFor(db: MockDb, slug: string) {
  const card = talentRecord(db, slug)?.rateCard;
  return card ?? { sellingRatePaise: String(internalFor(slug).sellingRatePaise), minimumRatePaise: String(minimumRateFor(slug)), payoutBps: internalFor(slug).payoutBps };
}

function mustRecord(db: MockDb, slug: string) {
  const record = talentRecord(db, slug);
  if (!record) throw new ApiError("NOT_FOUND", "Talent not found");
  return (db.talentRecords[slug] = record);
}

function requireRole(actor: StaffUser, ...roles: StaffRole[]) {
  if (!can(actor, ...roles)) throw new ApiError("FORBIDDEN", "Your role can't do that");
}

type Parsed<T> = { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
function parse<T>(result: Parsed<T>): T {
  if (!result.success) throw new ApiError("VALIDATION", result.error.issues[0]?.message ?? "Please check the form");
  return result.data;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "talent";

export function talentDetail(db: MockDb, actor: StaffUser, slug: string): TalentAdminDetail {
  const record = talentRecord(db, slug);
  if (!record) throw new ApiError("NOT_FOUND", "Talent not found");
  const { createdAt: _, ...rest } = record;
  return {
    ...rest,
    rateCard: can(actor, "SALES", "TALENT_MANAGER", "ACCOUNTS") ? record.rateCard : null,
    bookingCount: db.bookings.filter((b) => b.talentSlug === slug).length,
    publishBlockers: publishBlockers(record),
  };
}

export function createTalent(db: MockDb, actor: StaffUser, raw: unknown) {
  requireRole(actor, "TALENT_MANAGER");
  const { slug: wanted, ...input } = parse(TalentInputSchema.safeParse(raw));
  const base = wanted ?? slugify(input.stageName);
  let slug = base;
  for (let n = 2; talentRecord(db, slug); n++) {
    if (wanted) throw new ApiError("DUPLICATE", "That web address is already taken");
    slug = `${base}-${n}`;
  }
  db.talentRecords[slug] = { ...input, slug, status: "DRAFT", rateCard: null, reps: [], createdAt: nowIso() };
  audit(db, actor, "talent.create", "Talent", slug, `Created ${input.stageName} as a draft`);
  return { slug };
}

export function updateTalent(db: MockDb, actor: StaffUser, slug: string, raw: unknown) {
  requireRole(actor, "TALENT_MANAGER");
  const { slug: _, ...input } = parse(TalentInputSchema.safeParse(raw));
  const record = mustRecord(db, slug);
  Object.assign(record, input);
  audit(db, actor, "talent.update", "Talent", slug, "Profile edited");
}

export function setTalentStatus(db: MockDb, actor: StaffUser, slug: string, status: ProfileStatus) {
  requireRole(actor, "TALENT_MANAGER");
  const record = mustRecord(db, slug);
  if (status === "PUBLISHED") {
    const blockers = publishBlockers(record);
    if (blockers.length) throw new ApiError("NOT_PUBLISHABLE", blockers.join(". "));
  }
  audit(db, actor, "talent.status", "Talent", slug, `${record.status} → ${status}`);
  record.status = status;
}

export function setRateCard(db: MockDb, actor: StaffUser, slug: string, raw: unknown) {
  requireRole(actor, "TALENT_MANAGER", "ACCOUNTS");
  const card = parse(RateCardSchema.safeParse(raw));
  mustRecord(db, slug).rateCard = card;
  audit(db, actor, "talent.rateCard", "Talent", slug, `Standard ${card.sellingRatePaise}, minimum ${card.minimumRatePaise}, payout ${card.payoutBps / 100}%`);
}

export function addRep(db: MockDb, actor: StaffUser, slug: string, raw: unknown) {
  requireRole(actor, "TALENT_MANAGER");
  const input = parse(RepSchema.safeParse(raw));
  const rep = { id: newId("rep"), name: input.name, agencyName: input.agencyName || null, phone: input.phone, email: input.email || null, verification: "PENDING" as const };
  mustRecord(db, slug).reps.push(rep);
  audit(db, actor, "talent.addRep", "Talent", slug, `${rep.name}${rep.agencyName ? ` (${rep.agencyName})` : ""} added, pending verification`);
}

export function setRepVerification(db: MockDb, actor: StaffUser, repId: string, verification: VerificationStatus) {
  requireRole(actor, "TALENT_MANAGER");
  const owner = allTalentRecords(db).find((t) => t.reps.some((r) => r.id === repId));
  if (!owner) throw new ApiError("NOT_FOUND", "Representative not found");
  const record = mustRecord(db, owner.slug);
  const rep = record.reps.find((r) => r.id === repId)!;
  rep.verification = verification;
  // CAT-11: a talent whose last verified rep is revoked comes off the public site.
  if (verification !== "VERIFIED" && record.status === "PUBLISHED" && !record.reps.some((r) => r.verification === "VERIFIED")) {
    record.status = "HIDDEN";
    audit(db, actor, "talent.status", "Talent", record.slug, "PUBLISHED → HIDDEN (no verified representative)");
  }
  audit(db, actor, "talent.repVerification", "Talent", record.slug, `${rep.name} → ${verification}`);
}
