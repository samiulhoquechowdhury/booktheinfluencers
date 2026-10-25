import { ArrowRight } from "lucide-react";
import { FEATURED_TALENT } from "@/lib/mock/home";
import { SectionHeading } from "./section-heading";
import { TalentCard } from "./talent-card";

export function FeaturedTalent() {
  return (
    <section id="talent" aria-labelledby="talent-heading" className="shell py-20 sm:py-24">
      <SectionHeading
        id="talent-heading"
        eyebrow="Featured talent"
        title={
          <>
            Artists ready for your <em className="text-gold-deep">next stage</em>
          </>
        }
        description="Every profile shows who represents the artist and an indicative fee range. Your final price comes in a written quote."
        action={
          <a
            href="/talent"
            className="flex shrink-0 items-center gap-2 font-display text-sm font-semibold text-ink hover:text-gold-deep"
          >
            View all talent
            <ArrowRight className="size-4" aria-hidden />
          </a>
        }
      />

      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {FEATURED_TALENT.map((talent) => (
          <TalentCard key={talent.slug} talent={talent} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Sample profiles for preview.</p>
    </section>
  );
}
