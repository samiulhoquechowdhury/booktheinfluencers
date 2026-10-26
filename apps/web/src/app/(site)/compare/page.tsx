import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/feedback";
import { CompareView } from "@/components/talent/compare-view";

export const metadata: Metadata = { title: "Compare artists", robots: { index: false } };

export default function ComparePage() {
  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow="Compare" title="Side by side">
        Line up to three artists and compare fee ranges, languages, travel and representation.
      </PageIntro>
      <div className="mt-10">
        <CompareView />
      </div>
    </div>
  );
}
