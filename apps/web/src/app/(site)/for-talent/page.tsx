import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { ForTalent } from "@/components/home/for-talent";
import { PageIntro } from "@/components/ui/feedback";
import { SUPPORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "For artists & managers",
  description: "Get qualified enquiries, written contracts and clear payouts. Join by invitation from our talent team.",
};

const STEPS = [
  { title: "Introduce yourself", body: "Send your profile, a few recent performance videos and who manages your bookings." },
  { title: "We verify representation", body: "We confirm you or your agency are authorised to take bookings, and agree fee bands." },
  { title: "Get your invite", body: "You receive a private link to set up your portal login. Your public profile goes live after review." },
  { title: "Take bookings", body: "Confirm dates, see your contracted payout for each booking and block days you can't take." },
];

export default function ForTalentPage() {
  const subject = encodeURIComponent("Artist application");
  return (
    <>
      <div className="shell py-12 sm:py-16">
        <PageIntro eyebrow="For artists & managers" title="Serious enquiries. Signed terms. Paid on time.">
          We work with artists and agencies directly. Accounts are created by invitation once we've verified who
          represents you.
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
          <a href={`mailto:${SUPPORT.email}?subject=${subject}`} className="btn btn-gold">
            <Mail aria-hidden />
            Apply by email
          </a>
          <Link href="/sign-in?as=talent" className="btn btn-outline">
            Already invited? Sign in
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
      <ForTalent />
    </>
  );
}
