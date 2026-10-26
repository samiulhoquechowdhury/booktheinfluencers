import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BookingSteps } from "@/components/home/booking-steps";
import { PromiseSection } from "@/components/home/promise-section";
import { PageIntro } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "How it works",
  description: "From your brief to showtime: availability checks, itemised quotes, online contracts and protected payments.",
};

const FAQ = [
  {
    q: "Why can't I book instantly?",
    a: "Popular artists get many requests for the same dates. We confirm the date with their representative first, so you never pay for a booking that can't happen.",
  },
  {
    q: "Why do profiles show a range instead of a price?",
    a: "The final fee depends on your date, city, set length, travel and production needs. You'll get an itemised, written quote before you commit to anything.",
  },
  {
    q: "When is my booking confirmed?",
    a: "Only when four things are done: you've accepted the quote, signed the contract and paid the advance, and the artist's team has accepted. Your booking page shows each step.",
  },
  {
    q: "How do I pay?",
    a: "Through a secure payment gateway: UPI, cards or net banking. Usually an advance confirms the booking and the balance is due shortly before the event.",
  },
  {
    q: "What if the artist cancels?",
    a: "You get a full refund of what you've paid, or a replacement artist if you'd like one. Cancellations from your side follow the cancellation policy in your contract.",
  },
  {
    q: "Can I ask for a GST invoice?",
    a: "Yes. Add your company name and GSTIN to the brief and we'll issue the invoice in that name.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <div className="shell pt-12 sm:pt-16">
        <PageIntro eyebrow="How it works" title="Booking talent, without the chasing">
          You deal with one team. We deal with the agents, paperwork and payments, and we're honest about what's
          confirmed and what isn't.
        </PageIntro>
      </div>
      <BookingSteps />
      <PromiseSection />

      <section aria-labelledby="faq-heading" className="shell py-20">
        <h2 id="faq-heading" className="font-serif text-3xl font-semibold text-ink">
          Questions people ask
        </h2>
        <div className="mt-8 divide-y divide-line rounded-card border border-line bg-white">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden className="text-xl text-gold-deep transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-3xl leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <Link href="/enquiry" className="btn btn-gold mt-10">
          Send a brief
          <ArrowRight aria-hidden />
        </Link>
      </section>
    </>
  );
}
