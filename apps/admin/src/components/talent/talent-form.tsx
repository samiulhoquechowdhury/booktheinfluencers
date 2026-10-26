"use client";

import { useState, type ReactNode } from "react";
import { CATEGORIES, EVENT_TYPES } from "@repo/mock/catalogue/data";
import { TalentInputSchema, type TalentAdminDetail, type TalentInput } from "@repo/schemas";
import { toPaise, toRupees } from "@/lib/format";
import { inputClass } from "@/components/ui";

// ADM-1: one form for creating and editing a profile. Validates with the same schema as the API.

type Form = {
  stageName: string;
  slug: string;
  headline: string;
  bio: string;
  baseCity: string;
  travelsTo: string;
  languages: string;
  tags: string;
  eventTypes: string[];
  categories: string[];
  tier: TalentInput["tier"];
  representationType: TalentInput["representationType"];
  featured: boolean;
  feeMin: string;
  feeMax: string;
  photoUrl: string;
  galleryUrls: string;
};

const split = (value: string, by = ",") => value.split(by).map((v) => v.trim()).filter(Boolean);

function toForm(t?: TalentAdminDetail): Form {
  return {
    stageName: t?.stageName ?? "",
    slug: "",
    headline: t?.headline ?? "",
    bio: t?.bio ?? "",
    baseCity: t?.baseCity ?? "",
    travelsTo: t?.travelsTo.join(", ") ?? "",
    languages: t?.languages.join(", ") ?? "Hindi, English",
    tags: t?.tags.join(", ") ?? "",
    eventTypes: t?.eventTypes ?? [],
    categories: t?.categories ?? [],
    tier: t?.tier ?? "STANDARD",
    representationType: t?.representationType ?? "AGENCY_MANAGED",
    featured: t?.featured ?? false,
    feeMin: toRupees(t?.feeBandMinPaise),
    feeMax: toRupees(t?.feeBandMaxPaise),
    photoUrl: t?.photoUrl ?? "",
    galleryUrls: t?.galleryUrls.join("\n") ?? "",
  };
}

export function TalentForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: TalentAdminDetail;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: TalentInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: "eventTypes" | "categories", value: string) =>
    set(key, form[key].includes(value) ? form[key].filter((v) => v !== value) : [...form[key], value]);

  function submit() {
    const result = TalentInputSchema.safeParse({
      stageName: form.stageName,
      ...(!initial && form.slug.trim() && { slug: form.slug.trim() }),
      headline: form.headline,
      bio: form.bio,
      baseCity: form.baseCity,
      travelsTo: split(form.travelsTo),
      languages: split(form.languages),
      eventTypes: form.eventTypes,
      tags: split(form.tags),
      categories: form.categories,
      tier: form.tier,
      representationType: form.representationType,
      featured: form.featured,
      feeBandMinPaise: form.feeMin ? toPaise(form.feeMin) : null,
      feeBandMaxPaise: form.feeMax ? toPaise(form.feeMax) : null,
      photoUrl: form.photoUrl.trim(),
      galleryUrls: split(form.galleryUrls, "\n"),
    });
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.toReversed().map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    onSubmit(result.data);
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stage name" error={errors.stageName}>
          <input value={form.stageName} onChange={(e) => set("stageName", e.target.value)} className={inputClass} />
        </Field>
        {!initial && (
          <Field label="Web address (optional)" hint="Made from the stage name if left blank" error={errors.slug}>
            <input value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder="e.g. noor-band" className={inputClass} />
          </Field>
        )}
        <Field label="Headline" error={errors.headline}>
          <input value={form.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Live & playback singer" className={inputClass} />
        </Field>
        <Field label="Base city" error={errors.baseCity}>
          <input value={form.baseCity} onChange={(e) => set("baseCity", e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Bio" error={errors.bio}>
        <textarea rows={4} value={form.bio} onChange={(e) => set("bio", e.target.value)} className={inputClass} />
      </Field>

      <Field label="Categories (up to three)" error={errors.categories}>
        <Chips options={CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))} selected={form.categories} onToggle={(v) => toggle("categories", v)} />
      </Field>
      <Field label="Event types" error={errors.eventTypes}>
        <Chips options={EVENT_TYPES.map((e) => ({ value: e, label: e }))} selected={form.eventTypes} onToggle={(v) => toggle("eventTypes", v)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Languages" hint="Comma separated" error={errors.languages}>
          <input value={form.languages} onChange={(e) => set("languages", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Travels to" hint="Comma separated" error={errors.travelsTo}>
          <input value={form.travelsTo} onChange={(e) => set("travelsTo", e.target.value)} placeholder="Pan-India" className={inputClass} />
        </Field>
        <Field label="Tags" hint="Comma separated" error={errors.tags}>
          <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="bollywood, live band" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Tier">
          <select value={form.tier} onChange={(e) => set("tier", e.target.value as Form["tier"])} className={inputClass}>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </Field>
        <Field label="Representation">
          <select value={form.representationType} onChange={(e) => set("representationType", e.target.value as Form["representationType"])} className={inputClass}>
            <option value="AGENCY_MANAGED">Agency managed</option>
            <option value="TALENT_MANAGED">Self managed</option>
            <option value="PLATFORM_COORDINATED">Platform coordinated</option>
          </select>
        </Field>
        <Field label="Public band from (₹)" error={errors.feeBandMinPaise}>
          <input inputMode="numeric" value={form.feeMin} onChange={(e) => set("feeMin", e.target.value.replace(/\D/g, ""))} placeholder="On request" className={inputClass} />
        </Field>
        <Field label="Public band to (₹)" error={errors.feeBandMaxPaise}>
          <input inputMode="numeric" value={form.feeMax} onChange={(e) => set("feeMax", e.target.value.replace(/\D/g, ""))} placeholder="On request" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Profile photo link" hint="https only" error={errors.photoUrl}>
          <input value={form.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="https://" className={inputClass} />
        </Field>
        <Field label="Gallery links" hint="One per line, up to eight" error={errors.galleryUrls}>
          <textarea rows={3} value={form.galleryUrls} onChange={(e) => set("galleryUrls", e.target.value)} className={inputClass} />
        </Field>
      </div>
      {form.photoUrl.startsWith("https://") && (
        // eslint-disable-next-line @next/next/no-img-element -- staff-entered preview from any host
        <img src={form.photoUrl} alt="Profile photo preview" className="size-24 rounded-lg object-cover ring-1 ring-line" />
      )}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} className="size-4 accent-[var(--color-gold-deep)]" />
        Feature on the home page
      </label>

      {Object.keys(errors).length > 0 && <p role="alert" className="text-sm font-medium text-rose-700">Please fix the highlighted fields.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark disabled:opacity-50">
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-outline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-ink-soft">
        {label}
        {hint && <span className="ml-1 font-normal text-muted">· {hint}</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-rose-700">{error}</span>}
    </label>
  );
}

function Chips({ options, selected, onToggle }: { options: { value: string; label: string }[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
