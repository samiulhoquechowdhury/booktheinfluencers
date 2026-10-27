import Image from "next/image";
import { ArrowRight } from "lucide-react";
import crowd from "../../../public/images/footer.jpg";

export function CtaBand() {
  return (
    <section id="contact" aria-labelledby="cta-heading" className="relative isolate overflow-hidden py-20 text-white sm:py-24">
      {/* Client's concert-crowd photo; anchored at the bottom so the crowd and stage lights stay in view. */}
      <Image src={crowd} alt="" fill placeholder="blur" sizes="100vw" className="-z-20 object-cover object-bottom" />
      {/* The photo is already dark: a light tint keeps the lights visible and the text readable. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-ink/25" />

      <div className="shell flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div className="max-w-xl">
          <h2 id="cta-heading" className="font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Planning an event? <em className="text-warm">Tell us about it.</em>
          </h2>
          <p className="mt-4 leading-relaxed text-white/70">
            Share your date, city and budget. Our team comes back with artists who fit and are
            actually available.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <a href="/enquiry" className="btn btn-gold">
            Start your brief
            <ArrowRight aria-hidden />
          </a>
          <a href="#talent" className="btn btn-outline-light">
            Browse talent
          </a>
        </div>
      </div>
    </section>
  );
}
