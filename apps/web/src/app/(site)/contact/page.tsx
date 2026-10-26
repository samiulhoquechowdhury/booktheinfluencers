import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { PageIntro } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send our booking team a message. You'll get a reference number straight away.",
};

export default function ContactPage() {
  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow="Contact" title="Talk to a booking manager">
        Planning an event? The fastest way to get options is to send a brief. For anything else, write to us here.
      </PageIntro>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
        <ContactForm />
        <aside className="space-y-4">
          <div className="rounded-card bg-ink p-6 text-white">
            <p className="eyebrow text-warm">Have a date in mind?</p>
            <p className="mt-3 text-sm leading-relaxed text-white/80">
              A brief takes two minutes and gets you a reference number and a booking manager straight away.
            </p>
            <Link href="/enquiry" className="btn btn-gold mt-5">
              Send a brief
              <ArrowRight aria-hidden />
            </Link>
          </div>
          <div className="rounded-card border border-line bg-white p-6 text-sm">
            <p className="font-display font-semibold text-ink">Already booked?</p>
            <p className="mt-2 leading-relaxed text-muted">Message your manager from your booking page — it keeps everything in one place.</p>
            <Link href="/account" className="btn btn-outline btn-sm mt-4">
              My bookings
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
