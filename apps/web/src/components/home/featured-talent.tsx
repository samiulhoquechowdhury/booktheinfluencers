import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { featured } from "@/lib/catalogue";
import { TalentCard } from "@/components/talent/talent-card";
import { SectionHeading } from "./section-heading";

export async function FeaturedTalent() {
  const talents = await featured();
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
          <Link
            href="/talent"
            className="flex shrink-0 items-center gap-2 font-display text-sm font-semibold text-ink hover:text-gold-deep"
          >
            View all talent
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />

      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {talents.map((talent) => (
          <TalentCard key={talent.slug} talent={talent} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Sample profiles for preview.</p>
    </section>
  );
}
