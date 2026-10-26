import type { TalentProfile, TalentSummary } from "@repo/schemas";
import { BUDGET_BANDS, CATEGORIES, CITIES, TALENTS } from "./data";
import { BLACKOUT_SEED } from "./blackouts";

// Pure catalogue queries — the same contract GET /v1/talents will serve (CAT-1…CAT-4).

export const PAGE_SIZE = 12;

export const SORTS = [
  { id: "recommended", label: "Recommended" },
  { id: "fee-asc", label: "Fee: low to high" },
  { id: "fee-desc", label: "Fee: high to low" },
  { id: "name", label: "Name A–Z" },
] as const;

export type SortId = (typeof SORTS)[number]["id"];

export type TalentFilters = {
  q?: string;
  category?: string;
  city?: string;
  eventType?: string;
  language?: string;
  budget?: string;
  date?: string;
  verified?: boolean;
  sort?: SortId;
  page?: number;
};

export function toSummary(talent: TalentProfile): TalentSummary {
  const { bio, tags, gallery, pastEvents, ...summary } = talent;
  return summary;
}

function matchesKeyword(talent: TalentProfile, q: string) {
  const haystack = [talent.stageName, talent.headline, talent.bio, ...talent.tags, ...talent.categories]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function cityName(slugOrName: string) {
  return CITIES.find((city) => city.slug === slugOrName)?.name ?? slugOrName;
}

/** Fee band overlaps the chosen budget band. "On request" (no band) always passes. */
function matchesBudget(talent: TalentProfile, bandId: string) {
  const band = BUDGET_BANDS.find((b) => b.id === bandId);
  if (!band || !talent.feeBandMinPaise || !talent.feeBandMaxPaise) return true;
  const min = BigInt(talent.feeBandMinPaise);
  const max = BigInt(talent.feeBandMaxPaise);
  const bandMin = "minPaise" in band ? BigInt(band.minPaise) : 0n;
  const bandMax = "maxPaise" in band ? BigInt(band.maxPaise) : null;
  return max >= bandMin && (bandMax === null || min <= bandMax);
}

function travelsToCity(talent: TalentProfile, name: string) {
  return (
    talent.baseCity === name ||
    talent.travelsTo.some((place) => place === name || place === "Pan-India" || place === "International")
  );
}

export function searchTalents(filters: TalentFilters) {
  let results = TALENTS.filter((talent) => {
    if (filters.q && !matchesKeyword(talent, filters.q)) return false;
    if (filters.category && !talent.categories.includes(filters.category)) return false;
    if (filters.city && !travelsToCity(talent, cityName(filters.city))) return false;
    if (filters.eventType && !talent.eventTypes.includes(filters.eventType)) return false;
    if (filters.language && !talent.languages.includes(filters.language)) return false;
    if (filters.budget && !matchesBudget(talent, filters.budget)) return false;
    if (filters.verified && !talent.verified) return false;
    // CAT-4: a blackout hides the talent on that date; no blackout never means "available".
    if (filters.date && BLACKOUT_SEED[talent.slug]?.includes(filters.date)) return false;
    return true;
  });

  const feeOf = (talent: TalentProfile) => BigInt(talent.feeBandMinPaise ?? "0");
  switch (filters.sort) {
    case "fee-asc":
      results = results.toSorted((a, b) => (feeOf(a) < feeOf(b) ? -1 : feeOf(a) > feeOf(b) ? 1 : 0));
      break;
    case "fee-desc":
      results = results.toSorted((a, b) => (feeOf(a) > feeOf(b) ? -1 : feeOf(a) < feeOf(b) ? 1 : 0));
      break;
    case "name":
      results = results.toSorted((a, b) => a.stageName.localeCompare(b.stageName));
      break;
    default:
      results = results.toSorted((a, b) => Number(b.featured) - Number(a.featured) || Number(b.verified) - Number(a.verified));
  }

  const total = results.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const data = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toSummary);
  return { data, meta: { total, page, pageSize: PAGE_SIZE, pageCount } };
}

export function getTalent(slug: string): TalentProfile | undefined {
  return TALENTS.find((talent) => talent.slug === slug);
}

export function getTalentSummaries(slugs: readonly string[]): TalentSummary[] {
  return slugs.flatMap((slug) => {
    const talent = getTalent(slug);
    return talent ? [toSummary(talent)] : [];
  });
}

export function featuredTalents(limit = 6): TalentSummary[] {
  return TALENTS.filter((talent) => talent.featured).slice(0, limit).map(toSummary);
}

export function similarTalents(talent: TalentProfile, limit = 4): TalentSummary[] {
  return TALENTS.filter(
    (other) => other.slug !== talent.slug && other.categories.some((c) => talent.categories.includes(c)),
  )
    .slice(0, limit)
    .map(toSummary);
}

export function getCategory(slug: string) {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function getCity(slug: string) {
  return CITIES.find((city) => city.slug === slug);
}

/** Reads listing filters from URL search params. Unknown values are ignored. */
export function parseFilters(params: Record<string, string | string[] | undefined>): TalentFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };
  const sort = one("sort");
  const page = Number(one("page"));
  return {
    q: one("q"),
    category: one("category"),
    city: one("city"),
    eventType: one("eventType"),
    language: one("language"),
    budget: one("budget"),
    date: one("date"),
    verified: one("verified") === "1",
    sort: SORTS.some((s) => s.id === sort) ? (sort as SortId) : undefined,
    page: Number.isInteger(page) && page > 0 ? page : undefined,
  };
}
