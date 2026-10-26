"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { BUDGET_BANDS, CATEGORIES, CITIES, EVENT_TYPES, LANGUAGES } from "@/lib/catalogue/data";
import { SORTS, type TalentFilters } from "@/lib/catalogue/query";
import { filtersToQuery, type LockedFilters as Locked } from "@/lib/catalogue/query-string";

const selectClass =
  "w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-gold";

export function TalentFiltersPanel({ filters, locked = {} }: { filters: TalentFilters; locked?: Locked }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const apply = (patch: Partial<TalentFilters>) => {
    const next = { ...filters, ...patch, page: undefined };
    startTransition(() => router.push(`${pathname}${filtersToQuery(next, locked)}`, { scroll: false }));
  };

  const field = (label: string, control: React.ReactNode) => (
    <label className="block">
      <span className="eyebrow mb-1.5 block text-[0.65rem] text-muted">{label}</span>
      {control}
    </label>
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="btn btn-outline btn-sm w-full lg:hidden"
      >
        <SlidersHorizontal aria-hidden />
        {open ? "Hide filters" : "Filters"}
      </button>

      <form
        role="search"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          const q = new FormData(event.currentTarget).get("q");
          apply({ q: typeof q === "string" ? q.trim() || undefined : undefined });
        }}
        className={`${open ? "mt-4 block" : "hidden"} space-y-5 rounded-card border border-line bg-white p-5 lg:block`}
      >
        {field(
          "Search",
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={filters.q}
              key={filters.q ?? ""}
              placeholder="Name, style, tag…"
              className={selectClass}
            />
            <button type="submit" className="btn btn-dark btn-sm shrink-0">
              Go
            </button>
          </div>,
        )}

        {!locked.category &&
          field(
            "Category",
            <select value={filters.category ?? ""} onChange={(e) => apply({ category: e.target.value || undefined })} className={selectClass}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>,
          )}

        {!locked.city &&
          field(
            "City",
            <select value={filters.city ?? ""} onChange={(e) => apply({ city: e.target.value || undefined })} className={selectClass}>
              <option value="">Any city</option>
              {CITIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>,
          )}

        {field(
          "Event date",
          <input
            type="date"
            value={filters.date ?? ""}
            onChange={(e) => apply({ date: e.target.value || undefined })}
            className={selectClass}
          />,
        )}

        {field(
          "Event type",
          <select value={filters.eventType ?? ""} onChange={(e) => apply({ eventType: e.target.value || undefined })} className={selectClass}>
            <option value="">Any event</option>
            {EVENT_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>,
        )}

        {field(
          "Budget (fee range)",
          <select value={filters.budget ?? ""} onChange={(e) => apply({ budget: e.target.value || undefined })} className={selectClass}>
            <option value="">Any budget</option>
            {BUDGET_BANDS.map((band) => (
              <option key={band.id} value={band.id}>
                {band.label}
              </option>
            ))}
          </select>,
        )}

        {field(
          "Language",
          <select value={filters.language ?? ""} onChange={(e) => apply({ language: e.target.value || undefined })} className={selectClass}>
            <option value="">Any language</option>
            {LANGUAGES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>,
        )}

        <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={Boolean(filters.verified)}
            onChange={(e) => apply({ verified: e.target.checked || undefined })}
            className="size-4 accent-[var(--gold-deep)]"
          />
          Verified representatives only
        </label>

        <button
          type="button"
          onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}
          className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <X className="size-4" aria-hidden />
          Clear all filters
        </button>
      </form>
    </div>
  );
}

export function SortSelect({ filters, locked = {} }: { filters: TalentFilters; locked?: Locked }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Sort
      <select
        value={filters.sort ?? "recommended"}
        onChange={(e) =>
          router.push(`${pathname}${filtersToQuery({ ...filters, sort: e.target.value as TalentFilters["sort"], page: undefined }, locked)}`, {
            scroll: false,
          })
        }
        className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
      >
        {SORTS.map((sort) => (
          <option key={sort.id} value={sort.id}>
            {sort.label}
          </option>
        ))}
      </select>
    </label>
  );
}
