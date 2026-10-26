import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CITIES } from "@/lib/catalogue/data";
import { getCity, parseFilters } from "@/lib/catalogue/query";
import { PageIntro, Spinner } from "@/components/ui/feedback";
import { TalentListing } from "@/components/talent/talent-listing";

export function generateStaticParams() {
  return CITIES.map((city) => ({ city: city.slug }));
}

export async function generateMetadata({ params }: PageProps<"/cities/[city]">): Promise<Metadata> {
  const city = getCity((await params).city);
  if (!city) return {};
  return {
    title: `Book singers, DJs & comedians in ${city.name}`,
    description: `Verified artists who perform in ${city.name}: singers, DJs, comedians, anchors and creators for weddings, corporate events and festivals.`,
    alternates: { canonical: `/cities/${city.slug}` },
  };
}

export default async function CityPage({ params, searchParams }: PageProps<"/cities/[city]">) {
  const city = getCity((await params).city);
  if (!city) notFound();

  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow={city.name} title={`Talent for events in ${city.name}`}>
        Artists based in {city.name} or who travel there. Travel and stay, where needed, are itemised in your quote.
      </PageIntro>
      <div className="mt-10">
        <Suspense fallback={<Spinner label="Finding artists" />}>
          <Results city={city.slug} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Results({ city, searchParams }: { city: string; searchParams: PageProps<"/cities/[city]">["searchParams"] }) {
  const filters = parseFilters(await searchParams);
  return <TalentListing filters={filters} basePath={`/cities/${city}`} locked={{ city }} />;
}
