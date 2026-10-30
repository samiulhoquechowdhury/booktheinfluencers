"use client";

import { useEffect, useId, type ReactNode } from "react";
import { Check } from "lucide-react";

// Shared by the long forms (enquiry, artist setup, artist application), so they all behave the same way.

/**
 * Keeps the footer out of the way while this is on screen. An effect rather than a CSS marker in the page: Next.js
 * keeps a visited page in the document, hidden, but it does run effect cleanups when you leave.
 */
export function HideFooter() {
  useEffect(() => {
    document.body.setAttribute("data-hide-footer", "");
    return () => document.body.removeAttribute("data-hide-footer");
  }, []);
  return null;
}

export const fieldClass = "w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-gold aria-[invalid=true]:border-rose-400";

export type Control = { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined };

export function Field({ label, optional, hint, error, count, className = "", children }: { label: string; optional?: boolean; hint?: string; error?: string; count?: string; className?: string; children: (control: Control) => ReactNode }) {
  const id = useId();
  const note = `${id}-note`;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label} {optional && <span className="font-normal text-muted">(optional)</span>}
        </label>
        {count && <span className="text-xs tabular-nums text-muted">{count}</span>}
      </div>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": error || hint ? note : undefined })}
      {error ? <p id={note} role="alert" className="mt-1.5 text-xs text-rose-700">{error}</p> : hint ? <p id={note} className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** One choice from a short list, a tap away. */
export function Choices<T extends string | number>({ label, optional, options, value, onChange, error, hint, wide }: { label: string; optional?: boolean; options: { value: T; label: string }[]; value: T | undefined; onChange: (value: T) => void; error?: string; hint?: string; wide?: boolean }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-ink">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </legend>
      <div className={`mt-2 gap-2 ${wide ? "grid sm:grid-cols-2" : "flex flex-wrap"}`}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)} className={`inline-flex cursor-pointer items-center gap-1.5 text-sm ring-1 ring-inset transition-colors ${wide ? "rounded-lg px-4 py-3 text-left" : "rounded-full px-3 py-1.5"} ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}>
              {on && <Check className="size-3.5 shrink-0" aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-1.5 text-xs text-rose-700">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </fieldset>
  );
}

export type RailStep = { key: string; label: string; hint?: string; complete?: boolean };

/** Where you are in a long form: a list down the side on desktop, a strip with a progress bar on phones. */
export function StepRail({ steps, current, percent, status, onSelect }: { steps: RailStep[]; current: string; percent: number; status: string; onSelect?: (key: string) => void }) {
  const index = steps.findIndex((s) => s.key === current);
  return (
    <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
        <span>{status}</span>
        <span className="lg:hidden">Step {index + 1} of {steps.length}</span>
      </div>
      <div role="progressbar" aria-label="Progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <ol className="mt-4 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {steps.map((s, i) => {
          const on = s.key === current;
          return (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect?.(s.key)}
                aria-current={on ? "step" : undefined}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors lg:py-2.5 ${on ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-xs font-semibold ${s.complete ? "bg-emerald-600 text-white" : on ? "bg-ink text-white" : "bg-cream text-muted"}`}>
                  {s.complete ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block whitespace-nowrap font-display text-sm font-semibold ${on ? "text-ink" : "text-ink-soft"}`}>{s.label}</span>
                  {s.hint && <span className="hidden text-xs text-muted lg:block">{s.hint}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Back and Continue stay on screen, however long the step is. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-line bg-cream-soft/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-t-lg sm:px-0">{children}</div>;
}

export function showFirstProblem() {
  requestAnimationFrame(() => {
    const first = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-problem], [role="alert"]');
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (first?.matches("input, select, textarea")) first.focus({ preventScroll: true });
  });
}
