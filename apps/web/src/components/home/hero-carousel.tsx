"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { PublicHeroSlide } from "@repo/schemas";
import { publicHero } from "@repo/mock/site";
import { loadDb, onExternalChange } from "@repo/mock/store";
import { DEMO_MODE } from "@/lib/api/client";
import { ArrowRight, Pause, Play } from "lucide-react";

const BUNDLED_PATH = "/images/hero.jpg";

/** Demo mode: slides edited in the CRM live in this browser's mock store, so read them from there. */
const subscribeStore = (onChange: () => void) => onExternalChange(onChange);
const storeSnapshot = () => (DEMO_MODE ? JSON.stringify(publicHero(loadDb())) : null);
const useDemoSlides = () => {
  const json = useSyncExternalStore(subscribeStore, storeSnapshot, () => null);
  return useMemo(() => (json ? (JSON.parse(json) as PublicHeroSlide[]) : null), [json]);
};

const INTERVAL_MS = 6500;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () => useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);

/**
 * Cross-fading hero. Advances on its own, pauses while hovered or focused, and stays still
 * for people who ask for reduced motion. All slides share one box, so nothing jumps.
 */
export function HeroCarousel({ slides: served, bundled, ratio, children }: { slides: PublicHeroSlide[]; bundled: StaticImageData; ratio: string; children: ReactNode }) {
  const demo = useDemoSlides();
  const slides = demo?.length ? demo : served;
  const [picked, setActive] = useState(0);
  const active = picked % slides.length;
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();
  // null = no choice yet: plays unless the visitor asked for reduced motion.
  const [paused, setPaused] = useState<boolean | null>(null);
  const stopped = paused ?? reducedMotion;
  const many = slides.length > 1;

  useEffect(() => {
    if (!many || hovered || stopped) return;
    const timer = window.setTimeout(() => setActive((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [active, hovered, stopped, many, slides.length]);

  return (
    <div
      aria-roledescription={many ? "carousel" : undefined}
      aria-label="Highlights"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {/*
        The box keeps the photos' own aspect ratio, so the whole image is always visible.
        Phones: full-width banner above the text. Desktop: right-aligned, text on the dark left.
      */}
      <div className="relative lg:absolute lg:right-0 lg:top-0 lg:w-[70%]" style={{ aspectRatio: ratio }}>
        {slides.map((slide, i) => (
          <Image
            key={slide.id}
            src={slide.imageUrl === BUNDLED_PATH ? bundled : slide.imageUrl}
            alt={i === active ? slide.imageAlt : ""}
            aria-hidden={i !== active}
            fill
            priority={i === 0}
            // Uploaded photos are already resized by the CRM and served with long-lived caching.
            unoptimized={slide.imageUrl !== BUNDLED_PATH}
            placeholder={slide.imageUrl === BUNDLED_PATH ? "blur" : "empty"}
            sizes="(min-width: 1024px) 70vw, 100vw"
            className={`-z-20 object-cover transition-opacity duration-1000 ease-out ${i === active ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        <div aria-hidden className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-ink to-transparent to-30% lg:block" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-16 bg-gradient-to-t from-ink lg:h-24" />
      </div>

      {/* At least as tall as the desktop photo (70% width × its aspect ratio); grows if the text needs more. */}
      <div className="lg:flex lg:min-h-[calc(70vw*941/1672)] lg:items-center">
        <div className="shell pb-24 pt-8 lg:py-16">
          <div className="max-w-xl lg:max-w-md xl:max-w-xl">
            {/* Every slide's text sits in the same grid cell, so the block is as tall as the longest one. */}
            <div className="grid" aria-live={stopped || hovered ? "polite" : "off"}>
              {slides.map((slide, i) => {
                const Heading = i === 0 ? "h1" : "h2";
                const shown = i === active;
                return (
                  <div
                    key={slide.id}
                    aria-hidden={!shown}
                    inert={!shown}
                    role={many ? "group" : undefined}
                    aria-roledescription={many ? "slide" : undefined}
                    aria-label={many ? `${i + 1} of ${slides.length}` : undefined}
                    className={`col-start-1 row-start-1 transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
                  >
                    <p className="eyebrow text-warm">{slide.eyebrow}</p>
                    <Heading className="mt-5 font-serif text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-5xl xl:text-6xl">
                      {slide.title}
                      <span className="block italic text-warm">{slide.accent}</span>
                    </Heading>
                    <p className="mt-6 max-w-lg text-base leading-relaxed text-white/80 sm:text-lg lg:max-w-md">{slide.body}</p>
                    <div className="mt-8 flex flex-wrap gap-4 xl:mt-9">
                      <a href={slide.ctaHref} className="btn btn-gold">
                        {slide.ctaLabel}
                        <ArrowRight aria-hidden />
                      </a>
                      <a href="#for-talent" className="btn btn-outline-light">
                        Join as talent
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {children}

            {many && (
              <div className="mt-8 flex items-center gap-3">
                <div role="group" aria-label="Choose a slide" className="flex items-center gap-2">
                  {slides.map((slide, i) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setActive(i)}
                      aria-label={`Show slide ${i + 1}: ${slide.title} ${slide.accent}`}
                      aria-current={i === active}
                      className="group grid h-6 place-items-center"
                    >
                      <span className={`block h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-8 bg-warm" : "w-3 bg-white/35 group-hover:bg-white/60"}`} />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPaused(!stopped)}
                  aria-label={stopped ? "Play slideshow" : "Pause slideshow"}
                  className="grid size-8 place-items-center rounded-full text-white/60 ring-1 ring-white/20 transition-colors hover:text-white hover:ring-white/50"
                >
                  {stopped ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
