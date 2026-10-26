import { FilePenLine, Lock, ShieldCheck } from "lucide-react";
import heroImage from "../../../public/images/hero.jpg";
import { heroSlides } from "@/lib/catalogue";
import { HeroCarousel } from "./hero-carousel";

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Verified representatives" },
  { icon: FilePenLine, label: "Written contracts" },
  { icon: Lock, label: "Protected payments" },
];

/** Slides come from the CRM (Website → hero); each photo fills the whole hero as its background. */
export async function Hero() {
  const slides = await heroSlides();
  return (
    // lg:pb-14 leaves a dark strip under the photo for the overlapping search bar.
    <section className="relative isolate bg-ink text-white lg:pb-14">
      <HeroCarousel slides={slides} bundled={heroImage}>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 xl:mt-10">
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 font-display text-sm text-white/75">
              <Icon className="size-4 text-warm" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </HeroCarousel>
    </section>
  );
}
