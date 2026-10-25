import { Disc3, Drama, MicVocal, Presentation, Sparkles } from "lucide-react";
import { CATEGORIES } from "@/lib/mock/home";

const ICONS = { MicVocal, Disc3, Drama, Presentation, Sparkles };

export function CategoryStrip() {
  return (
    <section id="categories" aria-labelledby="categories-heading" className="shell pt-14">
      <h2 id="categories-heading" className="eyebrow text-center text-muted">
        Browse by category
      </h2>
      <ul className="mt-5 flex flex-wrap justify-center gap-3">
        {CATEGORIES.map(({ slug, label, icon }) => {
          const Icon = ICONS[icon];
          return (
            <li key={slug}>
              <a
                href={`/talent?category=${slug}`}
                className="flex items-center gap-2.5 rounded-full border border-line bg-white px-5 py-3 font-display text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-cream-soft"
              >
                <Icon className="size-[18px] text-gold-deep" aria-hidden />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
