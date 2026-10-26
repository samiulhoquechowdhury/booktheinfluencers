import type { TalentFilters } from "./query";

export type LockedFilters = { category?: string; city?: string };

/** Builds the listing URL query. Locked filters (set by the route itself) are left out. Shared by server and client. */
export function filtersToQuery(filters: TalentFilters, locked: LockedFilters = {}) {
  const params = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    ["q", filters.q],
    ["category", locked.category ? undefined : filters.category],
    ["city", locked.city ? undefined : filters.city],
    ["eventType", filters.eventType],
    ["language", filters.language],
    ["budget", filters.budget],
    ["date", filters.date],
    ["verified", filters.verified ? "1" : undefined],
    ["sort", filters.sort && filters.sort !== "recommended" ? filters.sort : undefined],
    ["page", filters.page && filters.page > 1 ? String(filters.page) : undefined],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}
