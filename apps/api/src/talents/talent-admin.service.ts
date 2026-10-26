import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, ProfileStatus, VerificationStatus } from "@repo/db";
import { publishBlockers as blockersFor, type RateCardInput, type RepInput, type TalentAdminDetail, type TalentInput } from "@repo/schemas";
import { DomainError, forbidden, notFound } from "../common/errors";
import type { AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { can } from "../staff/staff.service";

// ADM-1…5: talent profiles, publishing, rate cards and representatives — staff only, every change audited.
// Input schemas live in @repo/schemas so the admin form validates the same way.

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "talent";

const detailInclude = {
  categories: { include: { category: true } },
  rateCards: true,
  reps: { include: { rep: true } },
  _count: { select: { bookings: true } },
} satisfies Prisma.TalentInclude;

@Injectable()
export class TalentAdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private require(user: AuthUser, ...roles: Parameters<typeof can>[1][]) {
    if (!can(user, ...roles)) throw forbidden("Your role can't do that");
  }

  private async audit(tx: Prisma.TransactionClient, user: AuthUser, action: string, slug: string, summary: string) {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await tx.auditLog.create({ data: { actorId: user.id, actorName: actor?.name ?? "Unknown", action, entity: "Talent", entityId: slug, summary } });
  }

  async get(user: AuthUser, slug: string) {
    const talent = await this.prisma.db.talent.findUnique({ where: { slug }, include: detailInclude });
    if (!talent) throw notFound("Talent");
    const card = can(user, "SALES", "TALENT_MANAGER", "ACCOUNTS") ? talent.rateCards[0] : undefined;
    const paise = (v: bigint | null) => (v === null ? null : v.toString());
    return {
      slug: talent.slug,
      status: talent.status,
      stageName: talent.stageName,
      headline: talent.headline,
      bio: talent.bio,
      baseCity: talent.baseCity,
      travelsTo: talent.travelsTo,
      languages: talent.languages,
      eventTypes: talent.eventTypes,
      tags: talent.tags,
      categories: talent.categories.map((c) => c.category.slug),
      tier: talent.tier,
      representationType: talent.representationType,
      featured: talent.featured,
      feeBandMinPaise: paise(talent.feeBandMinPaise),
      feeBandMaxPaise: paise(talent.feeBandMaxPaise),
      photoUrl: talent.photoUrl,
      galleryUrls: talent.galleryUrls,
      rateCard: card ? { sellingRatePaise: card.sellingRatePaise.toString(), minimumRatePaise: card.minimumRatePaise.toString(), payoutBps: card.payoutBps } : null,
      reps: talent.reps.map(({ rep }) => ({ id: rep.id, name: rep.name, agencyName: rep.agencyName, phone: rep.phone, email: rep.email, verification: rep.verification })),
      bookingCount: talent._count.bookings,
      publishBlockers: publishBlockers(talent),
    } satisfies TalentAdminDetail;
  }

  /** ADM-1: new profiles start as DRAFT and stay off the public site until published. */
  async create(user: AuthUser, input: TalentInput) {
    this.require(user, "TALENT_MANAGER");
    const categories = await this.categoryIds(input.categories);
    const base = input.slug ?? slugify(input.stageName);
    return this.prisma.db.$transaction(async (tx) => {
      let slug = base;
      for (let n = 2; await tx.talent.findUnique({ where: { slug } }); n++) {
        if (input.slug) throw new DomainError("DUPLICATE", "That web address is already taken", 409);
        slug = `${base}-${n}`;
      }
      const talent = await tx.talent.create({
        data: {
          ...this.profileData(input),
          slug,
          status: "DRAFT",
          categories: { create: categories.map((categoryId) => ({ categoryId })) },
        },
      });
      await this.audit(tx, user, "talent.create", slug, `Created ${talent.stageName} as a draft`);
      return { slug };
    });
  }

  async update(user: AuthUser, slug: string, input: TalentInput) {
    this.require(user, "TALENT_MANAGER");
    const categories = await this.categoryIds(input.categories);
    await this.prisma.db.$transaction(async (tx) => {
      const talent = await tx.talent.findUnique({ where: { slug } });
      if (!talent) throw notFound("Talent");
      await tx.talentCategory.deleteMany({ where: { talentId: talent.id } });
      await tx.talent.update({
        where: { id: talent.id },
        data: { ...this.profileData(input), categories: { create: categories.map((categoryId) => ({ categoryId })) } },
      });
      await this.audit(tx, user, "talent.update", slug, "Profile edited");
    });
  }

  /** ADM-5 + CAT-11: only profiles with a verified representative, a photo and a category go live. */
  async setStatus(user: AuthUser, slug: string, status: ProfileStatus) {
    this.require(user, "TALENT_MANAGER");
    await this.prisma.db.$transaction(async (tx) => {
      const talent = await tx.talent.findUnique({ where: { slug }, include: detailInclude });
      if (!talent) throw notFound("Talent");
      if (status === "PUBLISHED") {
        const blockers = publishBlockers(talent);
        if (blockers.length) throw new DomainError("NOT_PUBLISHABLE", blockers.join(". "), 409);
      }
      await tx.talent.update({ where: { id: talent.id }, data: { status } });
      await this.audit(tx, user, "talent.status", slug, `${talent.status} → ${status}`);
    });
  }

  /** ADM-2: internal only; quotes below the minimum need super admin approval. */
  async setRateCard(user: AuthUser, slug: string, input: RateCardInput) {
    this.require(user, "TALENT_MANAGER", "ACCOUNTS");
    await this.prisma.db.$transaction(async (tx) => {
      const talent = await tx.talent.findUnique({ where: { slug }, include: { rateCards: true } });
      if (!talent) throw notFound("Talent");
      const data = { sellingRatePaise: BigInt(input.sellingRatePaise), minimumRatePaise: BigInt(input.minimumRatePaise), payoutBps: input.payoutBps };
      const existing = talent.rateCards[0];
      if (existing) await tx.rateCard.update({ where: { id: existing.id }, data });
      else await tx.rateCard.create({ data: { ...data, talentId: talent.id } });
      await this.audit(tx, user, "talent.rateCard", slug, `Standard ${input.sellingRatePaise}, minimum ${input.minimumRatePaise}, payout ${input.payoutBps / 100}%`);
    });
  }

  /** ADM-3: link a representative; they start PENDING until KYC is checked. */
  async addRep(user: AuthUser, slug: string, input: RepInput) {
    this.require(user, "TALENT_MANAGER");
    await this.prisma.db.$transaction(async (tx) => {
      const talent = await tx.talent.findUnique({ where: { slug } });
      if (!talent) throw notFound("Talent");
      const rep = await tx.representative.create({
        data: { name: input.name, agencyName: input.agencyName || null, phone: input.phone, email: input.email || null, verification: "PENDING" },
      });
      await tx.talentRep.create({ data: { talentId: talent.id, repId: rep.id } });
      await this.audit(tx, user, "talent.addRep", slug, `${rep.name}${rep.agencyName ? ` (${rep.agencyName})` : ""} added, pending verification`);
    });
  }

  async setRepVerification(user: AuthUser, repId: string, verification: VerificationStatus) {
    this.require(user, "TALENT_MANAGER");
    await this.prisma.db.$transaction(async (tx) => {
      const rep = await tx.representative.findUnique({ where: { id: repId }, include: { talents: { include: { talent: true } } } });
      if (!rep) throw notFound("Representative");
      await tx.representative.update({ where: { id: repId }, data: { verification } });
      // CAT-11: a talent whose last verified rep is revoked comes off the public site.
      if (verification !== "VERIFIED") {
        for (const { talent } of rep.talents) {
          const stillVerified = await tx.talentRep.count({ where: { talentId: talent.id, repId: { not: repId }, rep: { verification: "VERIFIED" } } });
          if (talent.status === "PUBLISHED" && stillVerified === 0) {
            await tx.talent.update({ where: { id: talent.id }, data: { status: "HIDDEN" } });
            await this.audit(tx, user, "talent.status", talent.slug, "PUBLISHED → HIDDEN (no verified representative)");
          }
        }
      }
      for (const { talent } of rep.talents) await this.audit(tx, user, "talent.repVerification", talent.slug, `${rep.name} → ${verification}`);
    });
  }

  private async categoryIds(slugs: string[]) {
    const rows = await this.prisma.db.category.findMany({ where: { slug: { in: slugs } } });
    if (rows.length !== new Set(slugs).size) throw new DomainError("VALIDATION", "Unknown category");
    return rows.map((c) => c.id);
  }

  private profileData(input: TalentInput) {
    return {
      stageName: input.stageName,
      headline: input.headline,
      bio: input.bio,
      baseCity: input.baseCity,
      travelsTo: input.travelsTo,
      languages: input.languages,
      eventTypes: input.eventTypes,
      tags: input.tags,
      tier: input.tier,
      representationType: input.representationType,
      featured: input.featured,
      feeBandMinPaise: input.feeBandMinPaise === null ? null : BigInt(input.feeBandMinPaise),
      feeBandMaxPaise: input.feeBandMaxPaise === null ? null : BigInt(input.feeBandMaxPaise),
      photoUrl: input.photoUrl,
      galleryUrls: input.galleryUrls,
    };
  }
}

function publishBlockers(t: Prisma.TalentGetPayload<{ include: typeof detailInclude }>) {
  return blockersFor({ ...t, reps: t.reps.map((r) => r.rep) });
}
