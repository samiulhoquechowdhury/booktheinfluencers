import Image from "next/image";
import { BadgeCheck, MapPin } from "lucide-react";
import { formatINRCompact } from "@repo/utils";
import { REPRESENTATION_LABELS, type FeaturedTalent } from "@/lib/mock/home";

export function TalentCard({ talent }: { talent: FeaturedTalent }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-line bg-white transition-shadow hover:shadow-card">
      <div className="relative aspect-[4/5] overflow-hidden bg-cream">
        <Image
          src={`${talent.photo}&w=480&h=600`}
          alt={`Portrait of ${talent.name}`}
          fill
          sizes="(min-width: 1280px) 16vw, (min-width: 768px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-display text-[0.68rem] font-semibold text-ink-soft backdrop-blur">
          {REPRESENTATION_LABELS[talent.representation]}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="flex items-center gap-1.5 font-display text-base font-semibold text-ink">
          {talent.name}
          {talent.verified && (
            <BadgeCheck className="size-4 shrink-0 text-gold-deep" aria-label="Verified representative" />
          )}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{talent.role}</p>

        <ul className="mb-4 mt-3 flex flex-wrap gap-1.5">
          {talent.languages.map((language) => (
            <li key={language} className="rounded-full bg-cream px-2.5 py-0.5 text-xs text-ink-soft">
              {language}
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-1.5 border-t border-line pt-3">
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {talent.city}
          </p>
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-[0.65rem] uppercase tracking-wider text-muted">Fee range</span>
            <span className="whitespace-nowrap font-display text-sm font-semibold text-ink">
              {formatINRCompact(talent.feeMinPaise)} – {formatINRCompact(talent.feeMaxPaise)}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}
