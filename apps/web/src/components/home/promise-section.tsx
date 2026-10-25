import Image from "next/image";
import { BadgeCheck, CalendarCheck, IndianRupee, ShieldCheck } from "lucide-react";
import { IMAGES } from "@/lib/mock/home";

const PROMISES = [
  {
    icon: CalendarCheck,
    title: "Request, never instant",
    body: "We check the date with the artist's representative before anything is promised to you.",
  },
  {
    icon: ShieldCheck,
    title: "Verified representation",
    body: "Each profile says who manages the artist — the talent, their agency or our team.",
  },
  {
    icon: IndianRupee,
    title: "Ranges, then a real quote",
    body: "Profiles show a fee range. Your final price arrives as a written quote before you commit.",
  },
  {
    icon: BadgeCheck,
    title: "Confirmed means confirmed",
    body: "A booking is confirmed only after the contract is signed and the advance is paid.",
  },
];

export function PromiseSection() {
  return (
    <section aria-labelledby="promise-heading" className="bg-cream py-20 sm:py-24">
      <div className="shell grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <p className="eyebrow text-gold-deep">Our promise</p>
          <h2
            id="promise-heading"
            className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl"
          >
            Every booking, <em className="text-gold-deep">on the record</em>
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted">
            No chasing agents on the phone, no unclear prices, no advance sent on trust. One team
            and one booking record from first enquiry to final payout.
          </p>
          <div className="relative mt-8 hidden aspect-[16/10] overflow-hidden rounded-card lg:block">
            <Image
              src={`${IMAGES.promise}&w=900&h=560`}
              alt="Performer on stage with arms raised in stage smoke"
              fill
              sizes="40vw"
              className="object-cover"
            />
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-card border border-line bg-white p-6 sm:p-7">
              <span className="grid size-11 place-items-center rounded-full bg-cream text-gold-deep">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
