import { Inject, Injectable } from "@nestjs/common";
import { notifyStaff, type Prisma, type Talent } from "@repo/db";
import {
  MAX_ID_DOCUMENT_BYTES,
  MAX_MEDIA_BYTES,
  OnboardingProfileSchema,
  onboardingMissing,
  type IdDocumentType,
  type OnboardingDocument,
  type OnboardingProfile,
  type OnboardingState,
} from "@repo/schemas";
import { DomainError, notFound } from "../common/errors";
import type { AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { sniff } from "../site/site.service";
import { openDocument, sealDocument } from "./document-vault";

// Artist self-onboarding. The artist fills in their profile and ID; a talent manager reviews it (talents/verification).
// Nothing here makes a profile public. Only approval does.

const rupees = (paise: bigint | null) => (paise === null ? "" : String(paise / 100n));
const paise = (value: string) => (value ? BigInt(value) * 100n : null);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "artist";

export const docRecord = (d: { id: string; type: string; fileName: string; mime: string; size: number; createdAt: Date }): OnboardingDocument => ({
  id: d.id,
  type: d.type as IdDocumentType,
  fileName: d.fileName,
  mime: d.mime,
  size: d.size,
  uploadedAt: d.createdAt.toISOString(),
});

export const docSelect = { id: true, type: true, fileName: true, mime: true, size: true, createdAt: true } satisfies Prisma.TalentDocumentSelect;

@Injectable()
export class OnboardingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async talentOf(user: AuthUser) {
    const talent = await this.prisma.db.talent.findUnique({
      where: { userId: user.id },
      include: { categories: { include: { category: true } }, documents: { select: docSelect, orderBy: { createdAt: "asc" } } },
    });
    if (!talent) throw notFound("Talent profile");
    return talent;
  }

  /** Staff-created profiles have no review of their own: they count as approved. */
  private effectiveStatus = (t: Pick<Talent, "reviewStatus">) => t.reviewStatus ?? "APPROVED";

  private requireEditable(t: Pick<Talent, "reviewStatus">) {
    const status = this.effectiveStatus(t);
    if (status === "SUBMITTED") throw new DomainError("IN_REVIEW", "Your profile is being reviewed. You can make changes once it's back.", 409);
    if (status === "APPROVED") throw new DomainError("APPROVED", "Your profile is verified. Ask your manager to change it.", 409);
  }

  private profileOf(t: Awaited<ReturnType<OnboardingService["talentOf"]>>): OnboardingProfile {
    return {
      legalName: t.legalName ?? "",
      stageName: t.stageName,
      headline: t.headline,
      bio: t.bio,
      baseCity: t.baseCity,
      categories: t.categories.map((c) => c.category.slug),
      languages: t.languages,
      eventTypes: t.eventTypes,
      travelsTo: t.travelsTo,
      feeFromRupees: rupees(t.feeBandMinPaise),
      feeToRupees: rupees(t.feeBandMaxPaise),
      photoUrl: t.photoUrl,
      galleryUrls: t.galleryUrls,
      socialLinks: (t.socialLinks ?? {}) as Record<string, string>,
    };
  }

  async state(user: AuthUser): Promise<OnboardingState> {
    const t = await this.talentOf(user);
    const profile = this.profileOf(t);
    const status = this.effectiveStatus(t);
    return {
      status,
      reviewNote: t.reviewNote,
      submittedAt: t.submittedAt?.toISOString() ?? null,
      reviewedAt: t.reviewedAt?.toISOString() ?? null,
      slug: t.slug,
      live: t.status === "PUBLISHED",
      editable: status === "INCOMPLETE" || status === "REJECTED",
      profile,
      documents: t.documents.map(docRecord),
      missing: onboardingMissing(profile, t.documents.length),
    };
  }

  async save(user: AuthUser, input: OnboardingProfile) {
    const t = await this.talentOf(user);
    this.requireEditable(t);
    const categories = await this.prisma.db.category.findMany({ where: { slug: { in: input.categories } }, select: { id: true } });
    if (categories.length !== new Set(input.categories).size) throw new DomainError("VALIDATION", "Unknown category");
    await this.prisma.db.$transaction(async (tx) => {
      await tx.talentCategory.deleteMany({ where: { talentId: t.id } });
      await tx.talent.update({
        where: { id: t.id },
        data: {
          legalName: input.legalName || null,
          stageName: input.stageName,
          headline: input.headline,
          bio: input.bio,
          baseCity: input.baseCity,
          languages: input.languages,
          eventTypes: input.eventTypes,
          travelsTo: input.travelsTo,
          feeBandMinPaise: paise(input.feeFromRupees),
          feeBandMaxPaise: paise(input.feeToRupees),
          photoUrl: input.photoUrl,
          galleryUrls: input.galleryUrls,
          socialLinks: Object.fromEntries(Object.entries(input.socialLinks).filter(([, url]) => url)),
          categories: { create: categories.map((c) => ({ categoryId: c.id })) },
        },
      });
    });
    return this.state(user);
  }

  async uploadPhoto(user: AuthUser, body: unknown, contentType: string | undefined, width: number, height: number) {
    this.requireEditable(await this.talentOf(user));
    if (!Buffer.isBuffer(body) || body.length === 0) throw new DomainError("VALIDATION", "Choose a JPEG, PNG or WebP photo");
    if (body.length > MAX_MEDIA_BYTES) throw new DomainError("TOO_LARGE", "Photos must be 4 MB or smaller", 413);
    const mime = sniff(body);
    if (!mime || mime !== contentType) throw new DomainError("VALIDATION", "That file isn't a JPEG, PNG or WebP photo");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 400 || height < 400 || width > 6000 || height > 6000) {
      throw new DomainError("VALIDATION", "Use a photo at least 400 × 400 pixels");
    }
    const media = await this.prisma.db.media.create({ data: { mime, bytes: new Uint8Array(body), width, height, size: body.length } });
    return { id: media.id, url: `/v1/media/${media.id}` };
  }

  async uploadDocument(user: AuthUser, type: IdDocumentType, fileName: string, body: unknown, contentType: string | undefined) {
    const t = await this.talentOf(user);
    this.requireEditable(t);
    if (!Buffer.isBuffer(body) || body.length === 0) throw new DomainError("VALIDATION", "Choose a photo or PDF of your ID");
    if (body.length > MAX_ID_DOCUMENT_BYTES) throw new DomainError("TOO_LARGE", "Files must be 5 MB or smaller", 413);
    const isPdf = body.subarray(0, 5).toString("latin1") === "%PDF-";
    const mime = isPdf ? "application/pdf" : sniff(body);
    if (!mime || mime !== contentType) throw new DomainError("VALIDATION", "Upload a JPEG, PNG, WebP or PDF file");
    const doc = await this.prisma.db.talentDocument.create({
      data: { talentId: t.id, type, fileName: fileName.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "document", mime, size: body.length, bytes: sealDocument(body, t.id) },
      select: docSelect,
    });
    return docRecord(doc);
  }

  async deleteDocument(user: AuthUser, id: string) {
    const t = await this.talentOf(user);
    this.requireEditable(t);
    const { count } = await this.prisma.db.talentDocument.deleteMany({ where: { id, talentId: t.id } });
    if (count === 0) throw notFound("Document");
  }

  /** The artist can open their own uploads, nobody else's. */
  async ownDocument(user: AuthUser, id: string) {
    const t = await this.talentOf(user);
    const doc = await this.prisma.db.talentDocument.findFirst({ where: { id, talentId: t.id } });
    if (!doc) throw notFound("Document");
    return { ...doc, bytes: openDocument(doc.bytes, t.id) };
  }

  async submit(user: AuthUser) {
    const t = await this.talentOf(user);
    this.requireEditable(t);
    const profile = this.profileOf(t);
    const missing = onboardingMissing(profile, t.documents.length);
    if (missing.length) throw new DomainError("INCOMPLETE", `Still needed: ${missing.map((m) => m.label).join(", ")}`, 409);
    // Saved drafts are checked again here so a stale save can't slip through.
    const checked = OnboardingProfileSchema.safeParse(profile);
    if (!checked.success) throw new DomainError("VALIDATION", checked.error.issues[0]?.message ?? "Please check your details");

    await this.prisma.db.$transaction(async (tx) => {
      let slug = t.slug;
      if (slug.startsWith("artist-")) {
        const base = slugify(t.stageName);
        slug = base;
        for (let n = 2; await tx.talent.findFirst({ where: { slug, id: { not: t.id } }, select: { id: true } }); n++) slug = `${base}-${n}`;
      }
      await tx.talent.update({ where: { id: t.id }, data: { slug, reviewStatus: "SUBMITTED", submittedAt: new Date(), reviewNote: null } });
      await tx.user.updateMany({ where: { id: user.id, name: "New artist" }, data: { name: t.stageName } });
      await tx.auditLog.create({ data: { actorId: user.id, actorName: t.stageName, action: "talent.submitted", entity: "Talent", entityId: slug, summary: `${t.stageName} submitted their profile and ${t.documents.length} ID ${t.documents.length === 1 ? "document" : "documents"} for review` } });
      const managers = await tx.user.findMany({ where: { disabledAt: null, roles: { has: "TALENT_MANAGER" } }, select: { id: true } });
      for (const m of managers) {
        await notifyStaff(tx, m.id, { event: "talent.submitted", subject: `New artist to verify: ${t.stageName}`, body: `${t.stageName} (${t.baseCity}) submitted their profile and ID. Review it in CRM → Verifications.` });
      }
    });
    return this.state(user);
  }
}
