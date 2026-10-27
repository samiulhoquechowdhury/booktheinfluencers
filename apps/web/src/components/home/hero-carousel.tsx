"use client";

import Image, { type StaticImageData } from "next/image";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { PublicHeroSlide } from "@repo/schemas";
import { publicHero } from "@repo/mock/site";
import { loadDb, onExternalChange } from "@repo/mock/store";
import { DEMO_MODE } from "@/lib/api/client";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

/** The main slide's photo, imported statically for its blur placeholder (it's the first thing people see). */
const BUNDLED_PATH = "/images/hero-main.jpg";

/** Demo mode: slides edited in the CRM live in this browser's mock store, so read them from there. */
const subscribeStore = (onChange: () => void) => onExternalChange(onChange);
const storeSnapshot = () => (DEMO_MODE ? JSON.stringify(publicHero(loadDb())) : null);
const useDemoSlides = () => {
  const json = useSyncExternalStore(subscribeStore, storeSnapshot, () => null);
  return useMemo(() => (json ? (JSON.parse(json) as PublicHeroSlide[]) : null), [json]);
};

/** How long each slide shows. The active dot fills over this time and advances the carousel when full. */
const INTERVAL_MS = 7000;
const SWIPE_PX = 50;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Full-bleed hero carousel. Loops forever; the active dot's progress bar is the timer, so hovering,
 * focusing or pressing pause freezes both together. Arrows, dots, ←/→ keys and swipes change slides.
 * With reduced motion the photos only cross-fade (no zoom, no slide-up).
 */
export function HeroCarousel({ slides: served, bundled, children }: { slides: PublicHeroSlide[]; bundled: StaticImageData; children: ReactNode }) {
  const demo = useDemoSlides();
  const slides = demo?.length ? demo : served;
  const [picked, setPicked] = useState(0);
  const active = picked % slides.length;
  const textRight = slides[active]?.textPosition === "right";
  const [hovered, setHovered] = useState(false);
  const [stopped, setStopped] = useState(false);
  const many = slides.length > 1;
  const running = many && !hovered && !stopped;
  const touchX = useRef<number | null>(null);

  const go = useCallback((delta: number) => setPicked((i) => (i + delta + slides.length) % slides.length), [slides.length]);

  return (
    <div
      aria-roledescription={many ? "carousel" : undefined}
      aria-label="Highlights"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={(e) => {
        if (!many || (e.target as HTMLElement).closest("input, select, textarea")) return;
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (!many || start === null || end === undefined || Math.abs(end - start) < SWIPE_PX) return;
        go(end < start ? 1 : -1);
      }}
    >
      {/* Full-bleed background: each photo covers the hero, slowly zooming while it's shown. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {slides.map((slide, i) => {
          const shown = i === active;
          return (
            <Image
              key={slide.id}
              src={slide.imageUrl === BUNDLED_PATH ? bundled : slide.imageUrl}
              alt={shown ? slide.imageAlt : ""}
              aria-hidden={!shown}
              fill
              priority={i === 0}
              // Photos shipped in /images get Next's resizing; CRM uploads are already resized and long-cached.
              unoptimized={!slide.imageUrl.startsWith("/images/")}
              placeholder={slide.imageUrl === BUNDLED_PATH ? "blur" : "empty"}
              sizes="100vw"
              className={`object-cover object-center [transition:opacity_1.2s_ease-out,transform_9s_linear] ${shown ? "opacity-100 motion-safe:scale-[1.06]" : "scale-100 opacity-0"}`}
            />
          );
        })}
        {/* Readable text on any photo: an even tint, deeper on the text's side and at the bottom. */}
        <div aria-hidden className="absolute inset-0 bg-ink/40" />
        <div aria-hidden className={`absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/20 to-transparent transition-opacity duration-1000 ${textRight ? "lg:opacity-0" : ""}`} />
        <div aria-hidden className={`absolute inset-0 hidden bg-gradient-to-l from-ink/70 via-ink/20 to-transparent transition-opacity duration-1000 lg:block ${textRight ? "opacity-100" : "opacity-0"}`} />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink/80 via-ink/40 to-transparent" />
      </div>

      {/* As tall as a 16:9 photo at full width (capped), so the picture shows whole on desktop. */}
      <div className="flex min-h-[520px] items-center sm:min-h-[580px] lg:min-h-[min(50vw,780px)]">
        <div className="shell w-full pb-12 pt-14 lg:pb-16 lg:pt-20">
          <div className="[text-shadow:0_2px_18px_rgb(0_0_0/0.35)]">
            {/* Every slide's text sits in the same grid cell, so the block is as tall as the longest one. */}
            <div className="grid" aria-live={stopped || hovered ? "polite" : "off"}>
              {slides.map((slide, i) => {
                const Heading = i === 0 ? "h1" : "h2";
                const shown = i === active;
                // Each line arrives a beat after the one above it.
                const line = (delay: string) =>
                  `transition-[opacity,transform] duration-700 ease-out ${shown ? `translate-y-0 opacity-100 ${delay}` : "opacity-0 motion-safe:translate-y-4"}`;
                return (
                  <div
                    key={slide.id}
                    aria-hidden={!shown}
                    inert={!shown}
                    role={many ? "group" : undefined}
                    aria-roledescription={many ? "slide" : undefined}
                    aria-label={many ? `${i + 1} of ${slides.length}` : undefined}
                    className={`col-start-1 row-start-1 w-full max-w-xl ${slide.textPosition === "right" ? "lg:ml-auto" : "xl:max-w-2xl"} ${shown ? "" : "pointer-events-none"}`}
                  >
                    <p className={`inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-warm ring-1 ring-inset ring-white/15 backdrop-blur-sm [text-shadow:none] ${line("delay-100")}`}>
                      <span aria-hidden className="size-1.5 rounded-full bg-warm" />
                      {slide.eyebrow}
                    </p>
                    <Heading className={`mt-5 text-balance font-serif text-[2.75rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[3.6rem] xl:text-7xl ${line("delay-200")}`}>
                      {slide.title}
                      <span className="block italic text-warm">{slide.accent}</span>
                    </Heading>
                    <p className={`mt-6 max-w-lg text-pretty text-base leading-relaxed text-white/85 sm:text-lg ${line("delay-300")}`}>{slide.body}</p>
                    <div className={`mt-8 flex flex-wrap gap-3 sm:gap-4 xl:mt-9 ${line("delay-[400ms]")}`}>
                      <a href={slide.ctaHref} className="group/cta btn btn-gold">
                        {slide.ctaLabel}
                        <ArrowRight aria-hidden className="transition-transform group-hover/cta:translate-x-0.5" />
                      </a>
                      <a href="#for-talent" className="btn btn-outline-light backdrop-blur-sm">
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
                <div className="mt-9 flex items-center gap-4">
                  <p className="font-display text-sm tabular-nums text-white/70" aria-hidden>
                    <span className="font-semibold text-white">{pad(active + 1)}</span> / {pad(slides.length)}
                  </p>
                  <div role="group" aria-label="Choose a slide" className="flex items-center gap-1.5">
                    {slides.map((slide, i) => (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => setPicked(i)}
                        aria-label={`Show slide ${i + 1}: ${slide.title} ${slide.accent}`}
                        aria-current={i === active}
                        className="group grid h-7 place-items-center"
                      >
                        <span className={`relative block h-1 overflow-hidden rounded-full transition-all duration-500 ${i === active ? "w-12 bg-white/25" : "w-5 bg-white/30 group-hover:bg-white/60"}`}>
                          {i === active && (
                            // The fill is the timer: when it completes, the next slide shows.
                            <span
                              key={`${slide.id}-${picked}`}
                              onAnimationEnd={() => go(1)}
                              className="absolute inset-0 origin-left rounded-full bg-warm [animation:hero-progress_linear_forwards]"
                              style={{ animationDuration: `${INTERVAL_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                            />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2 sm:ml-2">
                    <ControlButton label="Previous slide" onClick={() => go(-1)}>
                      <ChevronLeft className="size-4" aria-hidden />
                    </ControlButton>
                    <ControlButton label="Next slide" onClick={() => go(1)}>
                      <ChevronRight className="size-4" aria-hidden />
                    </ControlButton>
                    <ControlButton label={stopped ? "Play slideshow" : "Pause slideshow"} onClick={() => setStopped(!stopped)}>
                      {stopped ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
                    </ControlButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80 ring-1 ring-inset ring-white/20 backdrop-blur-sm transition hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
    >
      {children}
    </button>
  );
}
