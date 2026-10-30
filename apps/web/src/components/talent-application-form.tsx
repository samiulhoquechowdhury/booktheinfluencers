"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { CATEGORIES, CITIES } from "@repo/mock/catalogue/data";
import { api, errorMessage } from "@/lib/api/client";

const REPRESENTATION = ["I manage my own bookings", "An agency or manager represents me", "I'm an agency applying for an artist"];
const inputClass = "mt-1.5 w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-gold";

const EMPTY = { stageName: "", category: "", city: "", phone: "", email: "", representation: REPRESENTATION[0]!, links: "", about: "" };

export function TalentApplicationForm() {
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const submit = useMutation({ mutationFn: () => api.applications.submit(form) });

  if (submit.isSuccess) {
    return (
      <div className="rounded-card border border-line bg-white p-8 text-center sm:p-10">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 font-serif text-2xl font-semibold text-ink">Application received</h2>
        <p className="mt-2 text-muted">
          Your reference is <span className="font-display font-semibold text-gold-deep">{submit.data.ref}</span>.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          Our talent team reviews every application. If it's a fit, we'll get in touch and help you set up your artist
          profile.
        </p>
        <Link href="/for-talent" className="btn btn-outline mt-6">
          Back to For artists
        </Link>
      </div>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: key === "phone" ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value }));

  return (
    <form
      className="grid gap-5 rounded-card border border-line bg-white p-6 sm:grid-cols-2 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <label className="text-sm font-medium text-ink">
        Stage name
        <input value={form.stageName} onChange={set("stageName")} required minLength={2} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink">
        Category
        <select value={form.category} onChange={set("category")} required className={inputClass}>
          <option value="">Choose…</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug}>{c.name}</option>
          ))}
          <option>Other</option>
        </select>
      </label>
      <label className="text-sm font-medium text-ink">
        Base city
        <select value={form.city} onChange={set("city")} required className={inputClass}>
          <option value="">Choose…</option>
          {CITIES.map((c) => (
            <option key={c.slug}>{c.name}</option>
          ))}
          <option>Other</option>
        </select>
      </label>
      <label className="text-sm font-medium text-ink">
        Who manages your bookings?
        <select value={form.representation} onChange={set("representation")} className={inputClass}>
          {REPRESENTATION.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink">
        Mobile number
        <input value={form.phone} onChange={set("phone")} required inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink">
        Email
        <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        Links to your work
        <textarea
          value={form.links}
          onChange={set("links")}
          required
          rows={2}
          placeholder="YouTube, Instagram, Spotify or a press kit — one per line"
          className={inputClass}
        />
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        Tell us about your act
        <textarea
          value={form.about}
          onChange={set("about")}
          required
          minLength={20}
          rows={4}
          placeholder="What you perform, typical set length, languages, the kind of events you love"
          className={inputClass}
        />
      </label>
      <label className="flex cursor-pointer gap-3 text-sm text-ink-soft sm:col-span-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--gold-deep)]" />
        <span>
          I'm the artist or authorised to apply on their behalf, and I agree to the{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </span>
      </label>
      {submit.isError && (
        <p role="alert" className="text-sm text-rose-700 sm:col-span-2">
          {errorMessage(submit.error)}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={!consent || submit.isPending} className="btn btn-gold disabled:opacity-50">
          {submit.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          Submit application
        </button>
      </div>
    </form>
  );
}
