import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ForTalent } from "@/components/home/for-talent";
import { PageIntro } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "For artists & managers",
  description: "Get qualified enquiries, written contracts and clear payouts. Create your artist profile and go live once our team has verified you.",
};

const STEPS = [
  { title: "Sign in with your mobile", body: "Use your number to create your artist account. It takes a minute." },
  { title: "Complete your profile", body: "Add your photos, full name, social media links and a government ID." },
  { title: "We verify you", body: "Our talent team checks your details and documents. Your profile goes live only after approval." },
  { title: "Take bookings", body: "Confirm dates, see your contracted payout for each booking and block days you can't take." },
];

export default function ForTalentPage() {
  return (
    <>
      <div className="shell py-12 sm:py-16">
        <PageIntro eyebrow="For artists & managers" title="Serious enquiries. Signed terms. Paid on time.">
          We work with artists and agencies directly. Set up your profile yourself, and it appears on the site once
          we've verified you.
        </PageIntro>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-card border border-line bg-white p-6">
              <span className="font-serif text-3xl font-semibold text-gold">{String(index + 1).padStart(2, "0")}</span>
              <h2 className="mt-3 font-display text-lg font-semibold text-ink">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/sign-in?as=talent&next=/portal" className="btn btn-gold">
            Create your artist profile
            <ArrowRight aria-hidden />
          </Link>
          <Link href="/for-talent/apply" className="btn btn-outline">
            Talk to our team first
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
      <ForTalent />
    </>
  );
}
