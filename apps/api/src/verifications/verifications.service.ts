import { Inject, Injectable } from "@nestjs/common";
import { type Prisma } from "@repo/db";
import type { SocialLinks, VerificationDetail, VerificationRow } from "@repo/schemas";
import { DomainError, forbidden, notFound } from "../common/errors";
import type { AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { can } from "../staff/staff.service";
import { openDocument } from "../talent/document-vault";
import { docRecord, docSelect } from "../talent/onboarding.service";

// CRM → Verifications: talent managers check artists' details and ID, then approve (the profile goes live with a
// verified badge) or reject with a reason. Every look at an ID document is audited.

const include = {
  user: { select: { phone: true, email: true } },
  categories: { include: { category: true } },
  documents: { select: docSelect, orderBy: { createdAt: "asc" } },
} satisfies Prisma.TalentInclude;
type Row = Prisma.TalentGetPayload<{ include: typeof include }>;

const toRow = (t: Row): VerificationRow => ({
  slug: t.slug,
  stageName: t.stageName,
  legalName: t.legalName,
  phone: t.user?.phone ?? null,
  baseCity: t.baseCity,
  photoUrl: t.photoUrl,
  status: t.reviewStatus!,
  submittedAt: t.submittedAt?.toISOString() ?? null,
  reviewedAt: t.reviewedAt?.toISOString() ?? null,
  documentCount: t.documents.length,
});

@Injectable()
export class VerificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private require(user: AuthUser) {
    if (!can(user, "TALENT_MANAGER")) throw forbidden("Only talent managers verify artists");
  }

  private async audit(tx: Prisma.TransactionClient, user: AuthUser, action: string, slug: string, summary: string) {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await tx.auditLog.create({ data: { actorId: user.id, actorName: actor?.name ?? "Unknown", action, entity: "Talent", entityId: slug, summary } });
    return actor?.name ?? "Unknown";
  }

  /** Waiting first (oldest first, so nobody is left behind), then the rest. Blank drafts aren't work yet. */
  async list(user: AuthUser) {
    this.require(user);
    const rows = await this.prisma.db.talent.findMany({ where: { reviewStatus: { in: ["SUBMITTED", "APPROVED", "REJECTED"] } }, include, orderBy: { submittedAt: "asc" } });
    const order = { SUBMITTED: 0, REJECTED: 1, APPROVED: 2, INCOMPLETE: 3 };
    return rows.map(toRow).sort((a, b) => order[a.status] - order[b.status]);
  }

  async detail(user: AuthUser, slug: string): Promise<VerificationDetail> {
    this.require(user);
    const t = await this.prisma.db.talent.findFirst({ where: { slug, reviewStatus: { not: null } }, include });
    if (!t) throw notFound("Artist");
    return {
      ...toRow(t),
      headline: t.headline,
      bio: t.bio,
      categories: t.categories.map((c) => c.category.name),
      languages: t.languages,
      eventTypes: t.eventTypes,
      travelsTo: t.travelsTo,
      feeBandMinPaise: t.feeBandMinPaise?.toString() ?? null,
      feeBandMaxPaise: t.feeBandMaxPaise?.toString() ?? null,
      galleryUrls: t.galleryUrls,
      socialLinks: (t.socialLinks ?? {}) as SocialLinks,
      reviewNote: t.reviewNote,
      reviewedByName: t.reviewedByName,
      email: t.user?.email ?? null,
      documents: t.documents.map(docRecord),
      live: t.status === "PUBLISHED",
    };
  }

  async document(user: AuthUser, id: string) {
    this.require(user);
    const doc = await this.prisma.db.talentDocument.findUnique({ where: { id }, include: { talent: { select: { slug: true, stageName: true } } } });
    if (!doc) throw notFound("Document");
    const bytes = openDocument(doc.bytes, doc.talentId);
    await this.prisma.db.$transaction((tx) => this.audit(tx, user, "talent.documentViewed", doc.talent.slug, `Viewed ${doc.talent.stageName}'s ${doc.type.toLowerCase().replace("_", " ")}`));
    return { ...doc, bytes };
  }

  async approve(user: AuthUser, slug: string) {
    this.require(user);
    await this.prisma.db.$transaction(async (tx) => {
      const t = await tx.talent.findFirst({ where: { slug }, include: { ...include, reps: { include: { rep: true } } } });
      if (!t) throw notFound("Artist");
      if (t.reviewStatus !== "SUBMITTED") throw new DomainError("NOT_WAITING", "This artist isn't waiting for review", 409);
      if (t.documents.length === 0) throw new DomainError("NO_DOCUMENTS", "There's no ID to verify", 409);
      const name = await this.audit(tx, user, "talent.approved", slug, `Verified ${t.stageName} and published the profile`);
      // The artist represents themselves, so they're their own verified representative: that's what the public badge
      // and the publish rules (CAT-11) already read.
      if (!t.reps.some((r) => r.rep.verification === "VERIFIED")) {
        const rep = await tx.representative.create({
          data: { name: t.legalName ?? t.stageName, phone: t.user?.phone ?? "", email: t.user?.email ?? null, verification: "VERIFIED", kycDocumentIds: t.documents.map((d) => d.id) },
        });
        await tx.talentRep.create({ data: { talentId: t.id, repId: rep.id } });
      }
      await tx.talent.update({ where: { id: t.id }, data: { reviewStatus: "APPROVED", status: "PUBLISHED", reviewedAt: new Date(), reviewedByName: name, reviewNote: null } });
      if (t.user?.phone) await tx.notification.create({ data: { event: "talent.approved", channel: "SMS", to: t.user.phone, subject: "You're verified", body: `You're verified, ${t.stageName}! Your profile is now live.`, dedupeKey: `talent.approved:${t.id}:${Date.now()}` } });
    });
  }

  /** Sends it back with a reason. Also takes a verified artist off the site if something turns out to be wrong. */
  async reject(user: AuthUser, slug: string, reason: string) {
    this.require(user);
    await this.prisma.db.$transaction(async (tx) => {
      const t = await tx.talent.findFirst({ where: { slug }, include });
      if (!t) throw notFound("Artist");
      if (t.reviewStatus !== "SUBMITTED" && t.reviewStatus !== "APPROVED") throw new DomainError("NOT_WAITING", "This artist isn't waiting for review", 409);
      const name = await this.audit(tx, user, "talent.rejected", slug, `Sent back ${t.stageName}: ${reason}`);
      await tx.talent.update({ where: { id: t.id }, data: { reviewStatus: "REJECTED", reviewNote: reason, reviewedAt: new Date(), reviewedByName: name, ...(t.status === "PUBLISHED" && { status: "HIDDEN" }) } });
      if (t.user?.phone) await tx.notification.create({ data: { event: "talent.rejected", channel: "SMS", to: t.user.phone, subject: "Your profile needs a change", body: `Your profile needs a change: ${reason} Update it in your talent portal.`, dedupeKey: `talent.rejected:${t.id}:${Date.now()}` } });
    });
  }
}
