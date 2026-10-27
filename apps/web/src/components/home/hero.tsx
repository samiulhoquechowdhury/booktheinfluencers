import { FilePenLine, Lock, ShieldCheck } from "lucide-react";
import heroImage from "../../../public/images/hero-main.jpg";
import { heroSlides } from "@/lib/catalogue";
import { HeroCarousel } from "./hero-carousel";
import { SearchBar } from "./search-bar";

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Verified representatives" },
  { icon: FilePenLine, label: "Written contracts" },
  { icon: Lock, label: "Protected payments" },
];

/** Slides come from the CRM (Website → hero); each photo fills the whole hero as its background. */
export async function Hero() {
  const slides = await heroSlides();
  return (
    // The photo runs behind the search form and stops at its exact middle: the white panel below covers the
    // bottom half of the form's row, whatever height the form has (it's much taller on phones).
    <section className="relative isolate bg-ink text-white">
      <HeroCarousel slides={slides} bundled={heroImage}>
        <ul className="mt-8 flex flex-wrap gap-2 [text-shadow:none] xl:mt-10">
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-2 pr-3.5 font-display text-[0.8rem] text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur-md">
              <span className="grid size-6 place-items-center rounded-full bg-warm/20">
                <Icon className="size-3.5 text-warm" aria-hidden />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </HeroCarousel>
      <div className="relative">
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-background" />
        <SearchBar />
      </div>
    </section>
  );
}
