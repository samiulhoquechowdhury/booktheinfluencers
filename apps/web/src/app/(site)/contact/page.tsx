import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";
import { PageIntro } from "@/components/ui/feedback";
import { SUPPORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to our booking team by phone, WhatsApp or email.",
};

export default function ContactPage() {
  const channels = [
    { icon: Phone, label: "Call us", value: SUPPORT.phone, href: `tel:${SUPPORT.phone.replace(/\s/g, "")}` },
    { icon: MessageCircle, label: "WhatsApp", value: "Chat with the team", href: `https://wa.me/${SUPPORT.whatsapp}` },
    { icon: Mail, label: "Email", value: SUPPORT.email, href: `mailto:${SUPPORT.email}` },
  ];

  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro eyebrow="Contact" title="Talk to a booking manager">
        Planning an event? The fastest way to get options is to send a brief. For anything else, reach us here.
      </PageIntro>

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {channels.map(({ icon: Icon, label, value, href }) => (
          <li key={label}>
            <a
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noreferrer" : undefined}
              className="flex h-full flex-col rounded-card border border-line bg-white p-6 transition-shadow hover:shadow-card"
            >
              <Icon className="size-6 text-gold-deep" aria-hidden />
              <span className="mt-4 font-display font-semibold text-ink">{label}</span>
              <span className="mt-1 text-sm text-muted">{value}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-card bg-ink p-6 text-white sm:flex-row sm:items-center sm:p-8">
        <p className="max-w-xl text-white/80">
          Have a date, city and budget in mind? A brief takes two minutes and gets you a reference number straight away.
        </p>
        <Link href="/enquiry" className="btn btn-gold shrink-0">
          Send a brief
          <ArrowRight aria-hidden />
        </Link>
      </div>
      <p className="mt-6 text-xs text-muted">Contact details are placeholders until launch.</p>
    </div>
  );
}
