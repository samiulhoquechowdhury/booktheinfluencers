import Image from "next/image";
import { ArrowRight, FilePenLine, Lock, ShieldCheck } from "lucide-react";
import heroImage from "../../../public/images/hero.jpg";

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Verified representatives" },
  { icon: FilePenLine, label: "Written contracts" },
  { icon: Lock, label: "Protected payments" },
];

export function Hero() {
  return (
    // lg:pb-14 leaves a dark strip under the photo for the overlapping search bar.
    <section className="relative isolate bg-ink text-white lg:pb-14">
      {/*
        The box keeps the photo's own aspect ratio, so the whole image is always visible.
        Phones: full-width banner above the text. Desktop: right-aligned, text on the dark left.
      */}
      <div
        className="relative lg:absolute lg:right-0 lg:top-0 lg:w-[70%]"
        style={{ aspectRatio: `${heroImage.width} / ${heroImage.height}` }}
      >
        <Image
          src={heroImage}
          alt="Singer with a microphone on stage, flanked by three performers under warm stage lights"
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-ink to-transparent to-30% lg:block"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-16 bg-gradient-to-t from-ink lg:h-24" />
      </div>

      {/* At least as tall as the desktop photo (70% width × its aspect ratio); grows if the text needs more. */}
      <div className="lg:flex lg:min-h-[calc(70vw*941/1672)] lg:items-center">
        <div className="shell pb-24 pt-8 lg:py-16">
          <div className="max-w-xl lg:max-w-md xl:max-w-xl">
            <p className="eyebrow text-warm">Managed talent booking · India</p>
            <h1 className="mt-5 font-serif text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-5xl xl:text-6xl">
              Book the talent.
              <span className="block italic text-warm">We handle the rest.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/80 sm:text-lg lg:max-w-md">
              Singers, DJs, comedians, anchors and creators for weddings, corporate nights and
              campus fests. We confirm availability with their representatives, then take care of
              the quote, contract and payments.
            </p>

            <div className="mt-8 flex flex-wrap gap-4 xl:mt-9">
              <a href="#talent" className="btn btn-gold">
                Explore talent
                <ArrowRight aria-hidden />
              </a>
              <a href="#for-talent" className="btn btn-outline-light">
                Join as talent
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 xl:mt-10">
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 font-display text-sm text-white/75">
                  <Icon className="size-4 text-warm" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
