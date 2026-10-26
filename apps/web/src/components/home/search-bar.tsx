"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { CalendarDays, ChevronDown, MapPin, Search, Wallet } from "lucide-react";
import { toIstDateKey } from "@repo/utils";
import { BUDGET_BANDS, CITIES } from "@repo/mock/catalogue/data";

const noop = () => () => {};

const control = "w-full min-w-0 appearance-none bg-transparent font-display text-[0.95rem] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted";

/**
 * Home page search, overlapping the hero. A plain GET form into /talent, so it works without JavaScript;
 * with it, empty fields are left out of the URL and past dates can't be picked.
 */
export function SearchBar() {
  // Set after hydration (no date on the server), so the prerendered page stays cacheable.
  const today = useSyncExternalStore(noop, () => toIstDateKey(new Date()), () => undefined);

  return (
    <div id="search" className="shell relative z-10 -mt-20 scroll-mt-28 sm:-mt-16">
      <form
        action="/talent"
        role="search"
        aria-label="Find talent"
        onSubmit={(e) => {
          // /talent?q=&city=&date=&budget= → only the filters that were set. Disabled fields aren't sent.
          const empty = Array.from(e.currentTarget.elements).filter(
            (el): el is HTMLInputElement | HTMLSelectElement => (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && Boolean(el.name) && !el.value,
          );
          for (const el of empty) el.disabled = true;
          // Re-enable for when the visitor comes back with the browser's back button.
          requestAnimationFrame(() => empty.forEach((el) => (el.disabled = false)));
        }}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line/70 shadow-[0_24px_60px_-12px_rgb(17_24_30/0.28)] ring-1 ring-ink/5 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:gap-0 lg:bg-white lg:p-2"
      >
        <Field icon={Search} label="Talent" className="col-span-2 lg:col-span-1">
          <input name="q" type="search" placeholder="Singer, DJ, comedian…" autoComplete="off" enterKeyHint="search" className={control} />
        </Field>
        <Field icon={MapPin} label="City" divider>
          <Select name="city" placeholder="Any city" options={CITIES.map((c) => ({ value: c.slug, label: c.name }))} />
        </Field>
        <Field icon={CalendarDays} label="Event date" divider>
          <input type="date" name="date" min={today} aria-label="Event date" className={`${control} [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60`} />
        </Field>
        <Field icon={Wallet} label="Budget" divider className="col-span-2 lg:col-span-1">
          <Select name="budget" placeholder="Any budget" options={BUDGET_BANDS.map((b) => ({ value: b.id, label: b.label }))} />
        </Field>
        <div className="col-span-2 bg-white p-2 lg:col-span-1 lg:p-0 lg:pl-2">
          <button type="submit" className="btn btn-gold h-full min-h-12 w-full rounded-xl px-7 text-[0.95rem] lg:w-auto">
            <Search className="size-4" aria-hidden />
            Search talent
          </button>
        </div>
      </form>

    </div>
  );
}

function Field({ icon: Icon, label, divider = false, className = "", children }: { icon: typeof Search; label: string; divider?: boolean; className?: string; children: ReactNode }) {
  return (
    <label
      className={`group relative flex cursor-text items-center gap-2.5 bg-white px-3.5 py-3 sm:gap-3 sm:px-4 transition-colors hover:bg-cream-soft focus-within:bg-cream-soft lg:rounded-xl lg:py-2.5 ${divider ? "lg:before:absolute lg:before:inset-y-3 lg:before:left-0 lg:before:w-px lg:before:bg-line" : ""} ${className}`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cream sm:size-9 text-gold-deep transition-colors group-focus-within:bg-gold group-focus-within:text-ink">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted group-focus-within:text-gold-deep">{label}</span>
        {children}
      </span>
      {/* Gold underline on the field being edited. */}
      <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 origin-left scale-x-0 rounded-full bg-gold transition-transform group-focus-within:scale-x-100 lg:bottom-1" />
    </label>
  );
}

function Select({ name, placeholder, options }: { name: string; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <span className="relative flex items-center">
      <select name={name} defaultValue="" className={`${control} cursor-pointer pr-6`}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 size-4 text-muted" aria-hidden />
    </span>
  );
}
