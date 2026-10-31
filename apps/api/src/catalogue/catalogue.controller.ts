import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@repo/db";
import { TalentProfileSchema, TalentSummarySchema, type TalentProfile, type TalentSummary } from "@repo/schemas";
import { toIstDateKey } from "@repo/utils";
import { notFound } from "../common/errors";
import { paise, parse } from "../common/validate";
import { Public } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { LISTED } from "./listed";

const PAGE_SIZE = 12;

/** Budget bands mirror the website's filter (paise). */
export const BUDGETS: Record<string, { min?: bigint; max?: bigint }> = {
  "under-1l": { max: 10_000_000n },
  "1l-3l": { min: 10_000_000n, max: 30_000_000n },
  "3l-5l": { min: 30_000_000n, max: 50_000_000n },
  "5l-15l": { min: 50_000_000n, max: 150_000_000n },
  "15l-plus": { min: 150_000_000n },
};

const Filters = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(60).optional(),
  city: z.string().max(60).optional(),
  eventType: z.string().max(60).optional(),
  language: z.string().max(40).optional(),
  budget: z.enum(Object.keys(BUDGETS) as [string, ...string[]]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  verified: z.enum(["1"]).optional(),
  sort: z.enum(["recommended", "fee-asc", "fee-desc", "name"]).default("recommended"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  /** Comma-separated slugs (favourites, compare); returns up to 50 in one page. */
  slugs: z
    .string()
    .max(2000)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50))
    .optional(),
});

type TalentMatch = Pick<z.infer<typeof Filters>, "q" | "category" | "city" | "budget" | "date"> & Partial<Pick<z.infer<typeof Filters>, "slugs" | "eventType" | "language" | "verified">>;

/** Listed talent matching the filters. Shared with the website assistant, so it searches exactly like the site. */
export function talentWhere(f: TalentMatch): Prisma.TalentWhereInput {
  const band = f.budget ? BUDGETS[f.budget] : undefined;
  return {
    ...LISTED,
    ...(f.slugs && { slug: { in: f.slugs } }),
    ...(f.category && { categories: { some: { category: { slug: f.category } } } }),
    ...(f.eventType && { eventTypes: { has: f.eventType } }),
    ...(f.language && { languages: { has: f.language } }),
    ...(f.verified && { reps: { some: { rep: { verification: "VERIFIED" } } } }),
    ...(f.date && { blackouts: { none: { date: f.date } } }),
    ...(f.city && {
      OR: [
        { baseCity: { equals: f.city, mode: "insensitive" } },
        { travelsTo: { hasSome: [f.city, "Pan-India", "International"] } },
      ],
    }),
    // Budget and keyword conditions share one AND list, so neither filter replaces the other.
    AND: [
      ...(band?.min !== undefined ? [{ feeBandMaxPaise: { gte: band.min } }] : []),
      ...(band?.max !== undefined ? [{ feeBandMinPaise: { lte: band.max } }] : []),
      ...(f.q ?? "").split(/\s+/).filter(Boolean).map((word) => ({
        OR: [
          { stageName: { contains: word, mode: "insensitive" as const } },
          { headline: { contains: word, mode: "insensitive" as const } },
          { bio: { contains: word, mode: "insensitive" as const } },
          { tags: { has: word.toLowerCase() } },
        ],
      })),
    ],
  };
}

export const talentInclude = { categories: { include: { category: true } }, reps: { include: { rep: true } } } satisfies Prisma.TalentInclude;
export type TalentRow = Prisma.TalentGetPayload<{ include: typeof talentInclude }>;

function toSummary(t: TalentRow): TalentSummary {
  return TalentSummarySchema.parse({
    slug: t.slug,
    stageName: t.stageName,
    headline: t.headline,
    categories: t.categories.map((c) => c.category.slug),
    baseCity: t.baseCity,
    travelsTo: t.travelsTo,
    languages: t.languages,
    eventTypes: t.eventTypes,
    tier: t.tier,
    representationType: t.representationType,
    verified: t.reps.some((r) => r.rep.verification === "VERIFIED"),
    featured: t.featured,
    feeBandMinPaise: paise(t.feeBandMinPaise),
    feeBandMaxPaise: paise(t.feeBandMaxPaise),
    photo: t.photoUrl,
  });
}

function toProfile(t: TalentRow): TalentProfile {
  return TalentProfileSchema.parse({
    ...toSummary(t),
    bio: t.bio,
    tags: t.tags,
    gallery: t.galleryUrls,
    pastEvents: t.pastEvents,
  });
}

@Controller()
export class CatalogueController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get("categories")
  async categories() {
    const rows = await this.prisma.db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { talents: true } } } });
    return rows.map((c) => ({ slug: c.slug, name: c.name, blurb: c.blurb, icon: c.icon, talentCount: c._count.talents }));
  }

  /** CAT-1…4. Only PUBLISHED profiles (CAT-11). A blackout hides a talent on that date; nothing here implies availability. */
  @Public()
  @Get("talents")
  async list(@Query() query: unknown) {
    const f = parse(Filters, query);
    const where = talentWhere(f);
    const orderBy: Prisma.TalentOrderByWithRelationInput[] =
      f.sort === "fee-asc"
        ? [{ feeBandMinPaise: "asc" }]
        : f.sort === "fee-desc"
          ? [{ feeBandMinPaise: "desc" }]
          : f.sort === "name"
            ? [{ stageName: "asc" }]
            : [{ featured: "desc" }, { tier: "desc" }, { stageName: "asc" }];

    const pageSize = f.slugs ? 50 : PAGE_SIZE;
    const [total, rows] = await this.prisma.db.$transaction([
      this.prisma.db.talent.count({ where }),
      this.prisma.db.talent.findMany({ where, orderBy, include: talentInclude, skip: (f.page - 1) * pageSize, take: pageSize }),
    ]);
    return {
      data: rows.map(toSummary),
      meta: { total, page: f.page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  @Public()
  @Get("talents/:slug")
  async get(@Param("slug") slug: string) {
    const talent = await this.prisma.db.talent.findFirst({ where: { slug, ...LISTED }, include: talentInclude });
    if (!talent) throw notFound("Talent");
    return toProfile(talent);
  }

  /** AVL-4: dates this artist can't take, for customers. Only the dates: never why, or who set them. */
  @Public()
  @Get("talents/:slug/blocked-dates")
  async blockedDates(@Param("slug") slug: string) {
    const talent = await this.prisma.db.talent.findFirst({ where: { slug, ...LISTED }, select: { id: true } });
    if (!talent) throw notFound("Talent");
    const rows = await this.prisma.db.blackout.findMany({ where: { talentId: talent.id, date: { gte: toIstDateKey(new Date()) } }, orderBy: { date: "asc" }, select: { date: true, bookingId: true } });
    return { dates: rows.map((r) => r.date), booked: rows.filter((r) => r.bookingId).map((r) => r.date) };
  }
}
