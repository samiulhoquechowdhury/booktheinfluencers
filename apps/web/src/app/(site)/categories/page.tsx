import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CATEGORIES, CITIES, TALENTS } from "@/lib/catalogue/data";
import { CategoryIcon } from "@/components/category-icon";
import { PageIntro } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Categories",
  description: "Browse singers, DJs, comedians, anchors, speakers and creators available for events across India.",
};

export default function CategoriesPage() {
  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow="Categories" title="Every kind of act, one booking team">
        Start with a category, then narrow by city, date and budget.
      </PageIntro>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => {
          const count = TALENTS.filter((t) => t.categories.includes(category.slug)).length;
          return (
            <li key={category.slug}>
              <Link
                href={`/categories/${category.slug}`}
                className="group flex h-full flex-col rounded-card border border-line bg-white p-6 transition-shadow hover:shadow-card"
              >
                <span className="grid size-12 place-items-center rounded-full bg-cream text-gold-deep">
                  <CategoryIcon icon={category.icon} className="size-5" />
                </span>
                <h2 className="mt-5 font-serif text-2xl font-semibold text-ink">{category.name}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{category.blurb}</p>
                <span className="mt-5 flex items-center gap-2 font-display text-sm font-semibold text-ink group-hover:text-gold-deep">
                  {count} {count === 1 ? "artist" : "artists"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="cities-heading" className="mt-16">
        <h2 id="cities-heading" className="font-serif text-2xl font-semibold text-ink">
          Browse by city
        </h2>
        <ul className="mt-5 flex flex-wrap gap-2.5">
          {CITIES.map((city) => (
            <li key={city.slug}>
              <Link
                href={`/cities/${city.slug}`}
                className="block rounded-full border border-line bg-white px-4 py-2 text-sm text-ink transition-colors hover:border-gold hover:bg-cream-soft"
              >
                Talent in {city.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
