import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CATEGORIES } from "@repo/mock/catalogue/data";
import { getCategory, parseFilters } from "@repo/mock/catalogue/query";
import { PageIntro, Spinner } from "@/components/ui/feedback";
import { TalentListing } from "@/components/talent/talent-listing";

type Props = PageProps<"/categories/[slug]">;

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getCategory((await params).slug);
  // Runs before streaming starts, so unknown slugs get a real 404 status.
  if (!category) notFound();
  return {
    title: `Book ${category.name.toLowerCase()} for events`,
    description: `${category.blurb} Verified representation, written contracts and protected payments.`,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

/** URL data is read inside Suspense so navigation shows the shell instantly. */
export default function CategoryPage({ params, searchParams }: Props) {
  return (
    <div className="shell py-12 sm:py-16">
      <Suspense fallback={<Spinner label="Finding artists" />}>
        <Category params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Category({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  const filters = parseFilters(await searchParams);
  return (
    <>
      <PageIntro eyebrow="Category" title={`Book ${category.name.toLowerCase()}`}>
        {category.blurb}
      </PageIntro>
      <div className="mt-10">
        <TalentListing filters={filters} basePath={`/categories/${category.slug}`} locked={{ category: category.slug }} />
      </div>
    </>
  );
}
