import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CATEGORIES } from "@/lib/catalogue/data";
import { getCategory, parseFilters } from "@/lib/catalogue/query";
import { PageIntro, Spinner } from "@/components/ui/feedback";
import { TalentListing } from "@/components/talent/talent-listing";

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return {};
  return {
    title: `Book ${category.name.toLowerCase()} for events`,
    description: `${category.blurb} Verified representation, written contracts and protected payments.`,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  const category = getCategory((await params).slug);
  if (!category) notFound();

  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow="Category" title={`Book ${category.name.toLowerCase()}`}>
        {category.blurb}
      </PageIntro>
      <div className="mt-10">
        <Suspense fallback={<Spinner label="Finding artists" />}>
          <Results slug={category.slug} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Results({ slug, searchParams }: { slug: string; searchParams: PageProps<"/categories/[slug]">["searchParams"] }) {
  const filters = parseFilters(await searchParams);
  return <TalentListing filters={filters} basePath={`/categories/${slug}`} locked={{ category: slug }} />;
}
