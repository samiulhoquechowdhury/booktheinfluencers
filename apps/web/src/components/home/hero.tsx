import { existsSync } from "node:fs";
import path from "node:path";
import { FilePenLine, Lock, ShieldCheck } from "lucide-react";
import heroImage from "../../../public/images/hero.jpg";
import { HeroCarousel, type HeroSlide } from "./hero-carousel";

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Verified representatives" },
  { icon: FilePenLine, label: "Written contracts" },
  { icon: Lock, label: "Protected payments" },
];

// Every hero photo is 1672 × 941; the layout below depends on that ratio.
const SLIDES: (HeroSlide & { file: string })[] = [
  {
    file: "hero.jpg",
    src: heroImage,
    alt: "Singer with a microphone on stage, flanked by three performers under warm stage lights",
    eyebrow: "Managed talent booking · India",
    title: "Book the talent.",
    accent: "We handle the rest.",
    body: "Singers, DJs, comedians, anchors and creators for weddings, corporate nights and campus fests. We confirm availability with their representatives, then take care of the quote, contract and payments.",
    cta: { label: "Explore talent", href: "#talent" },
  },
  {
    file: "hero-2.jpg",
    src: "/images/hero-2.jpg",
    alt: "Film and music stars on a blue-lit set beside creators filming on their phones",
    eyebrow: "Stars & creators · one brief",
    title: "From the big screen",
    accent: "to every feed.",
    body: "Actors, playback singers and the creators your audience follows, booked through their own managers. One brief, one contract, one payment schedule.",
    cta: { label: "Browse creators", href: "/categories/creators" },
  },
  {
    file: "hero-3.jpg",
    src: "/images/hero-3.jpg",
    alt: "A group of musicians, photographers and creators gathered together, with a woman's profile lit in red",
    eyebrow: "Launches · campaigns · live shows",
    title: "Voices that move",
    accent: "your crowd.",
    body: "From an acoustic set at a launch to a creator collab for your campaign, we line up verified talent and handle every detail until the day.",
    cta: { label: "Plan your event", href: "/enquiry" },
  },
];

/** Slides whose photo is in public/images; drop hero-2.jpg or hero-3.jpg there and they join the rotation. */
const slides = SLIDES.filter((s) => existsSync(path.join(process.cwd(), "public/images", s.file))).map(({ file: _, ...slide }) => slide);

export function Hero() {
  return (
    // lg:pb-14 leaves a dark strip under the photo for the overlapping search bar.
    <section className="relative isolate bg-ink text-white lg:pb-14">
      <HeroCarousel slides={slides} ratio={`${heroImage.width} / ${heroImage.height}`}>
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
