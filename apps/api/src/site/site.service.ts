import { Inject, Injectable } from "@nestjs/common";
import type { HeroSlide, Media, Prisma } from "@repo/db";
import { MAX_MEDIA_BYTES, MEDIA_TYPES, type HeroSlideInput, type HeroSlideRecord, type PublicHeroSlide } from "@repo/schemas";
import { DomainError, forbidden, notFound } from "../common/errors";
import type { AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";

// Website content edited from the CRM: the home page hero carousel and the images it uses.

type Tx = Prisma.TransactionClient;
const MAX_SLIDES = 6;

const imageUrl = (s: Pick<HeroSlide, "imageId" | "imagePath">) => (s.imageId ? `/v1/media/${s.imageId}` : s.imagePath);

const toRecord = (s: HeroSlide): HeroSlideRecord => ({
  id: s.id,
  position: s.position,
  active: s.active,
  eyebrow: s.eyebrow,
  title: s.title,
  accent: s.accent,
  body: s.body,
  ctaLabel: s.ctaLabel,
  ctaHref: s.ctaHref,
  imageAlt: s.imageAlt,
  imageId: s.imageId,
  imageUrl: imageUrl(s),
  updatedAt: s.updatedAt.toISOString(),
});

/** First bytes of each allowed format, so a renamed file can't pass as an image. */
function sniff(bytes: Buffer): (typeof MEDIA_TYPES)[number] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

@Injectable()
export class SiteService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private requireAdmin(user: AuthUser) {
    if (!user.roles.includes("SUPER_ADMIN")) throw forbidden("Only super admins edit the website");
  }

  private async audit(tx: Tx, user: AuthUser, action: string, entityId: string, summary: string) {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await tx.auditLog.create({ data: { actorId: user.id, actorName: actor?.name ?? "Unknown", action, entity: "Website", entityId, summary } });
  }

  /** What the home page shows: active slides with a photo, in order. */
  async publicHero(): Promise<PublicHeroSlide[]> {
    const rows = await this.prisma.db.heroSlide.findMany({ where: { active: true }, orderBy: { position: "asc" } });
    return rows.flatMap((s) => {
      const url = imageUrl(s);
      return url ? [{ id: s.id, eyebrow: s.eyebrow, title: s.title, accent: s.accent, body: s.body, ctaLabel: s.ctaLabel, ctaHref: s.ctaHref, imageAlt: s.imageAlt, imageUrl: url }] : [];
    });
  }

  async listHero(user: AuthUser) {
    this.requireAdmin(user);
    const rows = await this.prisma.db.heroSlide.findMany({ orderBy: { position: "asc" } });
    return rows.map(toRecord);
  }

  async createHero(user: AuthUser, input: HeroSlideInput) {
    this.requireAdmin(user);
    return this.prisma.db.$transaction(async (tx) => {
      const count = await tx.heroSlide.count();
      if (count >= MAX_SLIDES) throw new DomainError("LIMIT", `Keep the carousel to ${MAX_SLIDES} slides or fewer`, 409);
      await this.assertImage(tx, input);
      const last = await tx.heroSlide.findFirst({ orderBy: { position: "desc" } });
      const slide = await tx.heroSlide.create({ data: { ...input, position: (last?.position ?? -1) + 1 } });
      await this.audit(tx, user, "hero.create", slide.id, `Slide “${slide.title}” added${slide.active ? "" : " (hidden)"}`);
      return toRecord(slide);
    });
  }

  async updateHero(user: AuthUser, id: string, input: HeroSlideInput) {
    this.requireAdmin(user);
    return this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.heroSlide.findUnique({ where: { id } });
      if (!existing) throw notFound("Slide");
      await this.assertImage(tx, { ...input, imagePath: existing.imagePath });
      await this.keepOneLive(tx, id, input.active);
      const slide = await tx.heroSlide.update({ where: { id }, data: input });
      await this.audit(tx, user, "hero.update", id, `Slide “${slide.title}” edited${existing.active !== slide.active ? (slide.active ? ", now shown" : ", now hidden") : ""}`);
      return toRecord(slide);
    });
  }

  async deleteHero(user: AuthUser, id: string) {
    this.requireAdmin(user);
    await this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.heroSlide.findUnique({ where: { id } });
      if (!existing) throw notFound("Slide");
      await this.keepOneLive(tx, id, false);
      await tx.heroSlide.delete({ where: { id } });
      await this.audit(tx, user, "hero.delete", id, `Slide “${existing.title}” removed`);
    });
  }

  /** Reorders by the full list of ids, first shown first. */
  async reorderHero(user: AuthUser, ids: string[]) {
    this.requireAdmin(user);
    await this.prisma.db.$transaction(async (tx) => {
      const all = await tx.heroSlide.findMany({ select: { id: true } });
      if (all.length !== ids.length || !all.every((s) => ids.includes(s.id))) throw new DomainError("VALIDATION", "The slide list changed — reload and try again", 409);
      for (const [position, id] of ids.entries()) await tx.heroSlide.update({ where: { id }, data: { position } });
      await this.audit(tx, user, "hero.reorder", "hero", "Slides reordered");
    });
  }

  async upload(user: AuthUser, body: unknown, contentType: string | undefined, width: number, height: number) {
    this.requireAdmin(user);
    if (!Buffer.isBuffer(body) || body.length === 0) throw new DomainError("VALIDATION", "Choose a JPEG, PNG or WebP image");
    if (body.length > MAX_MEDIA_BYTES) throw new DomainError("TOO_LARGE", "Images must be 4 MB or smaller", 413);
    const mime = sniff(body);
    if (!mime || mime !== contentType) throw new DomainError("VALIDATION", "That file isn't a JPEG, PNG or WebP image");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 800 || height < 300 || width > 6000 || height > 6000) {
      throw new DomainError("VALIDATION", "Use a landscape photo at least 800 × 300 pixels");
    }
    const media = await this.prisma.db.media.create({ data: { mime, bytes: new Uint8Array(body), width, height, size: body.length } });
    return { id: media.id, url: `/v1/media/${media.id}`, width, height };
  }

  async media(id: string): Promise<Media> {
    const media = await this.prisma.db.media.findUnique({ where: { id } });
    if (!media) throw notFound("Image");
    return media;
  }

  private async assertImage(tx: Tx, input: { imageId: string | null; active: boolean; imagePath?: string | null }) {
    if (input.imageId && !(await tx.media.findUnique({ where: { id: input.imageId }, select: { id: true } }))) throw new DomainError("VALIDATION", "Upload the photo again");
    if (input.active && !input.imageId && !input.imagePath) throw new DomainError("NO_IMAGE", "Add a photo before showing this slide", 409);
  }

  /** The home page always keeps at least one slide. */
  private async keepOneLive(tx: Tx, id: string, staysActive: boolean) {
    if (staysActive) return;
    const others = await tx.heroSlide.count({ where: { id: { not: id }, active: true } });
    if (others === 0) throw new DomainError("LAST_SLIDE", "Keep at least one slide showing on the home page", 409);
  }
}
