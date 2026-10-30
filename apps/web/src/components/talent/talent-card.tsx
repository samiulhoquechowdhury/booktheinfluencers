import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MapPin } from "lucide-react";
import type { TalentSummary } from "@repo/schemas";
import { REPRESENTATION_LABELS, feeBand } from "@/lib/format";
import { FavouriteButton } from "./favourite-button";
import { isUploaded, photoAt } from "@/lib/photo";

export function TalentCard({ talent, priority = false }: { talent: TalentSummary; priority?: boolean }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-white transition-shadow hover:shadow-card">
      <div className="relative aspect-[4/5] overflow-hidden bg-cream">
        <Image
          src={photoAt(talent.photo, 480, 600)}
          unoptimized={isUploaded(talent.photo)}
          alt={`Portrait of ${talent.stageName}`}
          fill
          priority={priority}
          sizes="(min-width: 1280px) 16vw, (min-width: 768px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-display text-[0.68rem] font-semibold text-ink-soft backdrop-blur">
          {REPRESENTATION_LABELS[talent.representationType]}
        </span>
        <span className="absolute right-3 top-3 z-10">
          <FavouriteButton slug={talent.slug} name={talent.stageName} />
        </span>
        {talent.tier === "PREMIUM" && (
          <span className="absolute bottom-3 left-3 rounded-md bg-ink/80 px-2 py-1 font-display text-[0.65rem] font-semibold uppercase tracking-wider text-warm backdrop-blur">
            Premium
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="flex items-center gap-1.5 font-display text-base font-semibold text-ink">
          <Link href={`/talent/${talent.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {talent.stageName}
          </Link>
          {talent.verified && (
            <BadgeCheck className="size-4 shrink-0 text-gold-deep" aria-label="Verified representative" />
          )}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{talent.headline}</p>

        <ul className="mb-4 mt-3 flex flex-wrap gap-1.5">
          {talent.languages.slice(0, 3).map((language) => (
            <li key={language} className="rounded-full bg-cream px-2.5 py-0.5 text-xs text-ink-soft">
              {language}
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-1.5 border-t border-line pt-3">
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {talent.baseCity}
          </p>
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-[0.65rem] uppercase tracking-wider text-muted">Fee range</span>
            <span className="whitespace-nowrap font-display text-sm font-semibold text-ink">{feeBand(talent)}</span>
          </p>
        </div>
      </div>
    </article>
  );
}
