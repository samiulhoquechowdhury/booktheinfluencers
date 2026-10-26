"use client";

import { Heart } from "lucide-react";
import { getTalentSummaries } from "@repo/mock/catalogue/query";
import { errorMessage } from "@/lib/api/client";
import { useFavourites } from "@/lib/api/hooks";
import { enquiryHref } from "@/lib/format";
import { RequireSession } from "@/components/auth/require-session";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { TalentCard } from "@/components/talent/talent-card";
import Link from "next/link";

export function FavouritesView() {
  return <RequireSession role="CUSTOMER">{() => <Favourites />}</RequireSession>;
}

function Favourites() {
  const { data: slugs, isPending, error, refetch } = useFavourites();
  if (isPending) return <Spinner label="Loading favourites" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  const talents = getTalentSummaries(slugs);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Favourites</h1>
          <p className="mt-1 text-muted">Artists you've saved for later.</p>
        </div>
        {talents.length > 1 && (
          <Link href={enquiryHref(talents.slice(0, 5).map((t) => t.slug))} className="btn btn-dark">
            Send one brief for these
          </Link>
        )}
      </div>
      {talents.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Heart className="size-6" aria-hidden />}
            title="No favourites yet"
            body="Tap the heart on any artist to save them here."
            action={{ href: "/talent", label: "Explore talent" }}
          />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {talents.map((talent) => (
            <TalentCard key={talent.slug} talent={talent} />
          ))}
        </div>
      )}
    </div>
  );
}
