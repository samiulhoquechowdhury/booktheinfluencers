import Image from "next/image";
import { OCCASIONS } from "@/lib/mock/home";
import { SectionHeading } from "./section-heading";

export function Occasions() {
  return (
    <section id="occasions" aria-labelledby="occasions-heading" className="bg-cream-soft py-20 sm:py-24">
      <div className="shell">
        <SectionHeading
          id="occasions-heading"
          eyebrow="Occasions"
          title={
            <>
              The right act for <em className="text-gold-deep">every room</em>
            </>
          }
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OCCASIONS.map((occasion) => (
            <li
              key={occasion.title}
              className="group relative isolate flex aspect-[4/5] items-end overflow-hidden rounded-card"
            >
              <Image
                src={`${occasion.photo}&w=600&h=750`}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="-z-10 object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
              <div className="p-6 text-white">
                <h3 className="font-serif text-2xl font-semibold">{occasion.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{occasion.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
