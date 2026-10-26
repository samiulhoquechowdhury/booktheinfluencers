import Image from "next/image";
import { ArrowRight, CalendarCheck, FilePenLine, ListFilter, Wallet } from "lucide-react";
import { IMAGES } from "@/lib/catalogue/data";

const FEATURES = [
  { icon: ListFilter, title: "Qualified enquiries", body: "Briefs arrive with date, city, audience and budget." },
  { icon: CalendarCheck, title: "Your calendar", body: "Accept or decline every request. Block dates any time." },
  { icon: FilePenLine, title: "Written terms", body: "Every booking runs on a signed contract." },
  { icon: Wallet, title: "Clear payouts", body: "See what you are owed and when it is paid." },
];

export function ForTalent() {
  return (
    <section id="for-talent" aria-labelledby="for-talent-heading" className="relative overflow-hidden bg-ink py-20 text-white sm:py-24">
      <div aria-hidden className="absolute -right-40 -top-40 size-[520px] rounded-full border border-white/5" />
      <div aria-hidden className="absolute -right-24 -top-24 size-[380px] rounded-full border border-white/5" />

      <div className="shell relative grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div>
          <p className="eyebrow text-warm">For artists & managers</p>
          <h2
            id="for-talent-heading"
            className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
          >
            Get booked on terms <em className="text-warm">you can trust</em>
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-white/70">
            List yourself or your roster. We bring serious enquiries, handle the paperwork and
            collect payment before the show.
          </p>

          <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon className="size-5 text-warm" aria-hidden />
                <h3 className="mt-3 font-display font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{body}</p>
              </li>
            ))}
          </ul>

          <a href="/for-talent" className="btn btn-gold mt-10">
            Join as talent
            <ArrowRight aria-hidden />
          </a>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden rounded-card lg:aspect-[5/6]">
          <Image
            src={`${IMAGES.forTalent}&w=900&h=1080`}
            alt="Microphone on a stand under a single spotlight"
            fill
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
          <div aria-hidden className="absolute inset-0 rounded-card ring-1 ring-inset ring-white/10" />
        </div>
      </div>
    </section>
  );
}
