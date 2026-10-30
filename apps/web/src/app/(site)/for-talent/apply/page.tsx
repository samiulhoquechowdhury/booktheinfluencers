import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/feedback";
import { TalentApplicationForm } from "@/components/talent-application-form";

export const metadata: Metadata = {
  title: "Apply as an artist",
  description: "Prefer to talk first? Tell us about yourself and our talent team will help you get listed.",
};

export default function ApplyPage() {
  return (
    <div className="bg-cream-soft">
      <div className="shell py-12 sm:py-16">
        <PageIntro eyebrow="For artists & managers" title="Apply to be listed">
          Tell us about your act. There's no fee to apply or to be listed.
        </PageIntro>
        <div className="mt-10 max-w-3xl">
          <TalentApplicationForm />
        </div>
      </div>
    </div>
  );
}
