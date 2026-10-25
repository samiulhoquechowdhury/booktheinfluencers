import { BadgeCheck, ClipboardList, FilePenLine, PhoneCall } from "lucide-react";
import { SectionHeading } from "./section-heading";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Share your brief",
    body: "Event date, city, audience and budget. It takes two minutes.",
  },
  {
    icon: PhoneCall,
    title: "We check availability",
    body: "Our team confirms the date and terms with the artist's representative.",
  },
  {
    icon: FilePenLine,
    title: "Quote & contract",
    body: "You get a written quote, then a contract you sign online.",
  },
  {
    icon: BadgeCheck,
    title: "Advance & confirmation",
    body: "Pay the advance and the booking is confirmed. We coordinate through the event.",
  },
];

export function BookingSteps() {
  return (
    <section id="how-it-works" aria-labelledby="steps-heading" className="shell py-20 sm:py-24">
      <SectionHeading
        id="steps-heading"
        eyebrow="How it works"
        title={
          <>
            From brief to showtime in <em className="text-gold-deep">four steps</em>
          </>
        }
        description="You deal with one team. We deal with the agents, paperwork and payments."
      />

      <ol className="relative mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div aria-hidden className="absolute left-[12%] right-[12%] top-[46px] hidden h-px bg-line lg:block" />
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="relative rounded-card border border-line bg-white p-6">
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-full bg-ink text-warm">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="font-serif text-3xl font-semibold text-line">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
