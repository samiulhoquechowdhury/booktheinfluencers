import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/ui/feedback";
import { BRAND_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us",
  description: "A managed talent booking platform for India: verified artists, written contracts and protected payments.",
};

const PRINCIPLES = [
  ["Request, don't promise", "We never show a booking as confirmed until it really is."],
  ["Know who you're dealing with", "Every artist is labelled as self-managed, agency-managed or coordinated by us."],
  ["Ranges up front, final price in writing", "Profiles show fee ranges; you get an itemised quote before paying anything."],
  ["Respect for artists", "Artists see their contracted payout and get paid on schedule."],
  ["No false endorsements", "We never imply an artist endorses us or a client."],
  ["People first", "Software keeps us fast, but a real booking manager handles your event."],
];

export default function AboutPage() {
  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow="About us" title="Booking talent should feel safe">
        Booking a singer, DJ, comedian or speaker in India often means calling several agents, guessing at prices and
        sending an advance on trust. {BRAND_NAME} replaces that with one brief, one team and one booking record, from
        first call to final payout.
      </PageIntro>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map(([title, body]) => (
          <li key={title} className="rounded-card border border-line bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/talent" className="btn btn-gold">
          Explore talent
          <ArrowRight aria-hidden />
        </Link>
        <Link href="/contact" className="btn btn-outline">
          Contact us
        </Link>
      </div>
    </div>
  );
}
