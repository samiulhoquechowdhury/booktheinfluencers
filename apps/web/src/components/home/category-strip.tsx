import Link from "next/link";
import { CATEGORIES } from "@/lib/catalogue/data";
import { CategoryIcon } from "@/components/category-icon";

export function CategoryStrip() {
  return (
    <section id="categories" aria-labelledby="categories-heading" className="shell pt-14">
      <h2 id="categories-heading" className="eyebrow text-center text-muted">
        Browse by category
      </h2>
      <ul className="mt-5 flex flex-wrap justify-center gap-3">
        {CATEGORIES.map(({ slug, name, icon }) => (
          <li key={slug}>
            <Link
              href={`/categories/${slug}`}
              className="flex items-center gap-2.5 rounded-full border border-line bg-white px-5 py-3 font-display text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-cream-soft"
            >
              <CategoryIcon icon={icon} className="size-[18px] text-gold-deep" />
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
