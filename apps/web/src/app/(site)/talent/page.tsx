import type { Metadata } from "next";
import { Suspense } from "react";
import { parseFilters } from "@repo/mock/catalogue/query";
import { PageIntro, Spinner } from "@/components/ui/feedback";
import { TalentListing } from "@/components/talent/talent-listing";

export const metadata: Metadata = {
  title: "Explore talent",
  description: "Search verified singers, DJs, comedians, anchors and creators by city, date, budget and language.",
};

export default function TalentPage({ searchParams }: PageProps<"/talent">) {
  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow="Explore talent" title="Find the right act for your event">
        Fee ranges are indicative. Your final price comes in a written, itemised quote after we confirm availability.
      </PageIntro>
      <div className="mt-10">
        <Suspense fallback={<Spinner label="Finding artists" />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/talent">["searchParams"] }) {
  const filters = parseFilters(await searchParams);
  return <TalentListing filters={filters} basePath="/talent" />;
}
