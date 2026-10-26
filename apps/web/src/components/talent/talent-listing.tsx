import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { formatDate } from "@repo/utils";
import { BUDGET_BANDS, CATEGORIES, CITIES } from "@repo/mock/catalogue/data";
import type { TalentFilters } from "@repo/mock/catalogue/query";
import { listTalents } from "@/lib/catalogue";
import { filtersToQuery, type LockedFilters as Locked } from "@repo/mock/catalogue/query-string";
import { EmptyState } from "@/components/ui/feedback";
import { TalentCard } from "./talent-card";
import { SortSelect, TalentFiltersPanel } from "./talent-filters";

/** Filtered, paginated grid shared by /talent, /categories/[slug] and /cities/[city]. */
export async function TalentListing({ filters, basePath, locked = {} }: { filters: TalentFilters; basePath: string; locked?: Locked }) {
  const { data, meta } = await listTalents(filters, locked);

  const chips = [
    filters.q && `“${filters.q}”`,
    !locked.category && filters.category && CATEGORIES.find((c) => c.slug === filters.category)?.name,
    !locked.city && filters.city && CITIES.find((c) => c.slug === filters.city)?.name,
    filters.eventType,
    filters.language,
    filters.budget && BUDGET_BANDS.find((b) => b.id === filters.budget)?.label,
    filters.date && `Free on ${formatDate(`${filters.date}T12:00:00+05:30`)}`,
    filters.verified && "Verified only",
  ].filter(Boolean);

  const pageHref = (page: number) => `${basePath}${filtersToQuery({ ...filters, page }, locked)}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside aria-label="Filters" className="lg:sticky lg:top-28 lg:self-start">
        <TalentFiltersPanel filters={filters} locked={locked} />
      </aside>

      <section aria-label="Results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            <span className="font-display font-semibold text-ink">{meta.total}</span>{" "}
            {meta.total === 1 ? "artist" : "artists"}
            {chips.length > 0 && <> · {chips.join(" · ")}</>}
          </p>
          <SortSelect filters={filters} locked={locked} />
        </div>

        {filters.date && (
          <p className="mt-3 rounded-md bg-cream-soft px-4 py-3 text-xs leading-relaxed text-muted">
            Artists who've blocked this date are hidden. Everyone else still needs a live check with their team. We
            confirm availability after you send your brief.
          </p>
        )}

        {data.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<SearchX className="size-6" aria-hidden />}
              title="No artists match yet"
              body="Try removing a filter or two, or send us a brief and our team will suggest artists who fit."
              action={{ href: "/enquiry", label: "Send a brief instead" }}
            />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {data.map((talent, index) => (
              <TalentCard key={talent.slug} talent={talent} priority={index < 3} />
            ))}
          </div>
        )}

        {meta.pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
            {meta.page > 1 && (
              <Link href={pageHref(meta.page - 1)} className="btn btn-outline btn-sm" aria-label="Previous page">
                <ChevronLeft aria-hidden />
              </Link>
            )}
            {Array.from({ length: meta.pageCount }, (_, i) => i + 1).map((page) => (
              <Link
                key={page}
                href={pageHref(page)}
                aria-current={page === meta.page ? "page" : undefined}
                className={`btn btn-sm min-w-11 ${page === meta.page ? "btn-dark" : "btn-outline"}`}
              >
                {page}
              </Link>
            ))}
            {meta.page < meta.pageCount && (
              <Link href={pageHref(meta.page + 1)} className="btn btn-outline btn-sm" aria-label="Next page">
                <ChevronRight aria-hidden />
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
