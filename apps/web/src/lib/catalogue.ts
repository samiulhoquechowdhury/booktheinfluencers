import { cacheLife } from "next/cache";
import type { PublicHeroSlide, TalentProfile, TalentSummary } from "@repo/schemas";
import { DEFAULT_HERO_SLIDES, publicHero } from "@repo/mock/site";
import { CATEGORIES, TALENTS } from "@repo/mock/catalogue/data";
import { featuredTalents, getTalent, searchTalents, similarTalents, type TalentFilters } from "@repo/mock/catalogue/query";
import { filtersToQuery, type LockedFilters } from "@repo/mock/catalogue/query-string";

// Catalogue reads for server components. With API_URL + NEXT_PUBLIC_API_BASE set they come from
// apps/api (GET /v1/talents…), cached for a few minutes; otherwise from the in-repo sample catalogue.

const API_URL = process.env.API_URL?.replace(/\/$/, "");
export const CATALOGUE_FROM_API = Boolean(API_URL && process.env.NEXT_PUBLIC_API_BASE);

type Page = { data: TalentSummary[]; meta: { total: number; page: number; pageSize: number; pageCount: number } };

async function apiGet<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${API_URL}/v1${path}`, { ...init, headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Catalogue API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export async function listTalents(filters: TalentFilters, locked: LockedFilters = {}): Promise<Page> {
  // A date search has to respect a date blocked a moment ago, so it never comes from the cache.
  if (CATALOGUE_FROM_API && filters.date) return (await apiGet<Page>(`/talents${filtersToQuery({ ...filters, ...locked })}`, { cache: "no-store" }))!;
  return cachedTalents(filters, locked);
}

async function cachedTalents(filters: TalentFilters, locked: LockedFilters): Promise<Page> {
  "use cache";
  cacheLife("minutes");
  if (!CATALOGUE_FROM_API) return searchTalents({ ...filters, ...locked });
  // The API takes category/city as ordinary filters, so the locked ones go in too.
  const query = filtersToQuery({ ...filters, ...locked });
  return (await apiGet<Page>(`/talents${query}`))!;
}

export async function talentProfile(slug: string): Promise<TalentProfile | null> {
  "use cache";
  cacheLife("minutes");
  if (!CATALOGUE_FROM_API) return getTalent(slug) ?? null;
  return apiGet<TalentProfile>(`/talents/${encodeURIComponent(slug)}`);
}

export async function similarTo(talent: TalentProfile, limit = 4): Promise<TalentSummary[]> {
  "use cache";
  cacheLife("minutes");
  if (!CATALOGUE_FROM_API) return similarTalents(talent, limit);
  const page = await apiGet<Page>(`/talents?category=${encodeURIComponent(talent.categories[0] ?? "")}`);
  return (page?.data ?? []).filter((t) => t.slug !== talent.slug).slice(0, limit);
}

export async function featured(limit = 6): Promise<TalentSummary[]> {
  "use cache";
  cacheLife("minutes");
  if (!CATALOGUE_FROM_API) return featuredTalents(limit);
  const page = await apiGet<Page>("/talents");
  return (page?.data ?? []).filter((t) => t.featured).slice(0, limit);
}

export async function categoryCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("minutes");
  if (!CATALOGUE_FROM_API) {
    return Object.fromEntries(CATEGORIES.map((c) => [c.slug, TALENTS.filter((t) => t.categories.includes(c.slug)).length]));
  }
  const rows = await apiGet<{ slug: string; talentCount: number }[]>("/categories");
  return Object.fromEntries((rows ?? []).map((c) => [c.slug, c.talentCount]));
}

/** Every public talent slug (sitemap). */
export async function allTalentSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  if (!CATALOGUE_FROM_API) return TALENTS.map((t) => t.slug);
  const slugs: string[] = [];
  for (let page = 1, pageCount = 1; page <= pageCount; page++) {
    const res = await apiGet<Page>(`/talents?page=${page}`);
    if (!res) break;
    pageCount = res.meta.pageCount;
    slugs.push(...res.data.map((t) => t.slug));
  }
  return slugs;
}

/** Home page hero slides (edited in the CRM → Website). Falls back to the built-in slide if the API is down. */
export async function heroSlides(): Promise<PublicHeroSlide[]> {
  "use cache";
  cacheLife("minutes");
  if (!CATALOGUE_FROM_API) return publicHero({ heroSlides: DEFAULT_HERO_SLIDES, media: {} });
  const slides = await apiGet<PublicHeroSlide[]>("/site/hero").catch(() => null);
  return slides?.length ? slides : publicHero({ heroSlides: DEFAULT_HERO_SLIDES, media: {} });
}
