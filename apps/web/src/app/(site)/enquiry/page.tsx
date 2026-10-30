import type { Metadata } from "next";
import { Suspense } from "react";
import { PageIntro, Spinner } from "@/components/ui/feedback";
import { EnquiryForm } from "@/components/enquiry/enquiry-form";

export const metadata: Metadata = {
  title: "Send a brief",
  description: "Tell us about your event once. We check availability with each artist's team and send an itemised quote.",
};

export default function EnquiryPage({ searchParams }: PageProps<"/enquiry">) {
  return (
    <div className="bg-cream-soft">
      <div className="shell py-12 sm:py-16">
        <PageIntro eyebrow="Event brief" title="One brief. We do the chasing.">
          It takes about two minutes. There's no charge and no commitment until you accept a quote.
        </PageIntro>
        <div className="mt-10">
          <Suspense fallback={<Spinner />}>
            <Form searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/enquiry">["searchParams"] }) {
  const raw = (await searchParams).talent;
  const talents = (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",").filter(Boolean);
  // A different artist starts a fresh brief.
  return <EnquiryForm key={talents.join()} initialTalents={talents} />;
}
