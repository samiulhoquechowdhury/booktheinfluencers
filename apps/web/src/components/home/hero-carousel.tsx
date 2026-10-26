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

/**
 * Cross-fading hero that loops forever on its own, pausing while hovered or focused or after the
 * pause button. With reduced motion it only fades (no slide-up). All slides share one box, so nothing jumps.
 */
export function HeroCarousel({
  slides: served,
  bundled,
  children,
}: {
  slides: PublicHeroSlide[];
  bundled: StaticImageData;
  children: ReactNode;
}) {
  const demo = useDemoSlides();
  const slides = demo?.length ? demo : served;
  const [picked, setActive] = useState(0);
  const active = picked % slides.length;
  const textRight = slides[active]?.textPosition === "right";
  const [hovered, setHovered] = useState(false);
  // Loops forever: last slide → first. Only the pause button (or a hover) holds it still.
  const [stopped, setPaused] = useState(false);
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
      {/* Full-bleed background: every photo covers the whole hero, centred, under an even tint for the text. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {slides.map((slide, i) => (
          <Image
            key={slide.id}
            src={slide.imageUrl === BUNDLED_PATH ? bundled : slide.imageUrl}
            alt={i === active ? slide.imageAlt : ""}
            aria-hidden={i !== active}
            fill
            priority={i === 0}
            // Photos shipped in /images get Next's resizing; CRM uploads are already resized and long-cached.
            unoptimized={!slide.imageUrl.startsWith("/images/")}
            placeholder={slide.imageUrl === BUNDLED_PATH ? "blur" : "empty"}
            sizes="100vw"
            className={`object-cover object-center transition-opacity duration-1000 ease-out ${i === active ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        {/* Readable text on any photo: a light tint everywhere, a little deeper behind the copy and at the bottom. */}
        <div aria-hidden className="absolute inset-0 bg-ink/45" />
        {/* Deeper on the side the text is on; the two sides cross-fade with the slides. */}
        <div
          aria-hidden
          className={`absolute inset-0 bg-gradient-to-r from-ink/60 via-ink/15 to-transparent transition-opacity duration-1000 ${textRight ? "lg:opacity-0" : ""}`}
        />
        <div
          aria-hidden
          className={`absolute inset-0 hidden bg-gradient-to-l from-ink/60 via-ink/15 to-transparent transition-opacity duration-1000 lg:block ${textRight ? "opacity-100" : "opacity-0"}`}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink to-transparent"
        />
      </div>

      {/* As tall as a 16:9 photo at full width (capped), so the picture shows whole on desktop. */}
      <div className="flex min-h-[560px] items-center sm:min-h-[620px] lg:min-h-[min(56.25vw,860px)]">
        <div className="shell w-full pb-28 pt-16 lg:py-24">
          <div className="[text-shadow:0_1px_14px_rgb(0_0_0/0.35)]">
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
                    className={`col-start-1 row-start-1 w-full max-w-xl transition-all duration-700 ease-out ${slide.textPosition === "right" ? "lg:ml-auto" : "xl:max-w-2xl"} ${shown ? "translate-y-0 opacity-100" : "pointer-events-none opacity-0 motion-safe:translate-y-3"}`}
                  >
                    <p className="eyebrow text-warm">{slide.eyebrow}</p>
                    <Heading className="mt-5 font-serif text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-5xl xl:text-6xl">
                      {slide.title}
                      <span className="block italic text-warm">{slide.accent}</span>
                    </Heading>
                    <p className="mt-6 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
                      {slide.body}
                    </p>
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

            <div className={`max-w-xl ${textRight ? "lg:ml-auto" : "xl:max-w-2xl"}`}>
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
                        <span
                          className={`block h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-8 bg-warm" : "w-3 bg-white/35 group-hover:bg-white/60"}`}
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaused(!stopped)}
                    aria-label={stopped ? "Play slideshow" : "Pause slideshow"}
                    className="grid size-8 place-items-center rounded-full text-white/60 ring-1 ring-white/20 transition-colors hover:text-white hover:ring-white/50"
                  >
                    {stopped ? (
                      <Play className="size-3.5" aria-hidden />
                    ) : (
                      <Pause className="size-3.5" aria-hidden />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
