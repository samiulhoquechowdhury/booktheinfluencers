import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CITIES } from "@/lib/catalogue/data";
import { getCity, parseFilters } from "@/lib/catalogue/query";
import { PageIntro, Spinner } from "@/components/ui/feedback";
import { TalentListing } from "@/components/talent/talent-listing";

type Props = PageProps<"/cities/[city]">;

export function generateStaticParams() {
  return CITIES.map((city) => ({ city: city.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const city = getCity((await params).city);
  // Runs before streaming starts, so unknown slugs get a real 404 status.
  if (!city) notFound();
  return {
    title: `Book singers, DJs & comedians in ${city.name}`,
    description: `Verified artists who perform in ${city.name}: singers, DJs, comedians, anchors and creators for weddings, corporate events and festivals.`,
    alternates: { canonical: `/cities/${city.slug}` },
  };
}

/** URL data is read inside Suspense so navigation shows the shell instantly. */
export default function CityPage({ params, searchParams }: Props) {
  return (
    <div className="shell py-12 sm:py-16">
      <Suspense fallback={<Spinner label="Finding artists" />}>
        <City params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function City({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const city = getCity((await params).city);
  if (!city) notFound();
  const filters = parseFilters(await searchParams);
  return (
    <>
      <PageIntro eyebrow={city.name} title={`Talent for events in ${city.name}`}>
        Artists based in {city.name} or who travel there. Travel and stay, where needed, are itemised in your quote.
      </PageIntro>
      <div className="mt-10">
        <TalentListing filters={filters} basePath={`/cities/${city.slug}`} locked={{ city: city.slug }} />
      </div>
    </>
  );
}
