"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, GitCompareArrows, X } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useCompareList } from "@/lib/compare";
import { REPRESENTATION_LABELS, ctaLabel, enquiryHref, feeBand } from "@/lib/format";
import { EmptyState, Spinner } from "@/components/ui/feedback";

export function CompareView() {
  const { list, remove } = useCompareList();
  const profiles = useQueries({
    queries: list.map((slug) => ({ queryKey: ["catalogue", "profile", slug], queryFn: () => api.catalogue.profile(slug), staleTime: 60_000 })),
  });
  if (profiles.some((p) => p.isPending)) return <Spinner label="Loading artists" />;
  // Artists that no longer exist simply drop out of the comparison.
  const talents = profiles.flatMap((p) => (p.data ? [p.data] : []));

  if (talents.length === 0) {
    return (
      <EmptyState
        icon={<GitCompareArrows className="size-6" aria-hidden />}
        title="Nothing to compare yet"
        body="Open an artist's profile and tap Compare. You can line up to three side by side."
        action={{ href: "/talent", label: "Explore talent" }}
      />
    );
  }

  const rows: { label: string; render: (t: (typeof talents)[number]) => React.ReactNode }[] = [
    { label: "Fee range", render: (t) => <span className="font-display font-semibold text-ink">{feeBand(t)}</span> },
    { label: "Based in", render: (t) => t.baseCity },
    { label: "Travels to", render: (t) => t.travelsTo.join(", ") },
    { label: "Languages", render: (t) => t.languages.join(", ") },
    { label: "Great for", render: (t) => t.eventTypes.join(", ") },
    {
      label: "Representation",
      render: (t) => (
        <span className="flex items-center gap-1.5">
          {REPRESENTATION_LABELS[t.representationType]}
          {t.verified && <BadgeCheck className="size-4 text-gold-deep" aria-label="Verified" />}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Artist comparison</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-40 p-4 align-bottom font-normal text-muted">
                Artist
              </th>
              {talents.map((t) => (
                <th key={t.slug} scope="col" className="p-4 align-top font-normal">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-cream">
                    <Image src={`${t.photo}&w=400&h=300`} alt="" fill sizes="25vw" className="object-cover" />
                    <button
                      type="button"
                      onClick={() => remove(t.slug)}
                      aria-label={`Remove ${t.stageName} from comparison`}
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-ink"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <Link href={`/talent/${t.slug}`} className="mt-3 block font-display text-base font-semibold text-ink hover:text-gold-deep">
                    {t.stageName}
                  </Link>
                  <span className="text-muted">{t.headline}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <th scope="row" className="p-4 font-normal text-muted">
                  {row.label}
                </th>
                {talents.map((t) => (
                  <td key={t.slug} className="p-4 text-ink-soft">
                    {row.render(t)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="p-4" />
              {talents.map((t) => (
                <td key={t.slug} className="p-4">
                  <Link href={enquiryHref([t.slug])} className="btn btn-outline btn-sm">
                    {ctaLabel(t)}
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {talents.length > 1 && (
        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-card bg-ink p-6 text-white sm:flex-row sm:items-center">
          <p className="text-white/80">
            Can't decide? Send <span className="font-semibold text-white">one brief</span> for all {talents.length}. We'll
            check each artist's date and quote for the ones who are free.
          </p>
          <Link href={enquiryHref(talents.map((t) => t.slug))} className="btn btn-gold shrink-0">
            Send one brief
            <ArrowRight aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
