"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Send } from "lucide-react";
import { INDIAN_MOBILE } from "@repo/schemas";
import { CATEGORIES, CITIES } from "@repo/mock/catalogue/data";
import { api, errorMessage } from "@/lib/api/client";
import { ActionBar, Choices, Field, HideFooter, fieldClass, showFirstProblem } from "@/components/ui/form-steps";

const REPRESENTATION = ["I manage my own bookings", "An agency or manager represents me", "I'm an agency applying for an artist"];
const EMPTY = { stageName: "", category: "", city: "", phone: "", email: "", representation: REPRESENTATION[0]!, links: "", about: "" };
type Form = typeof EMPTY;

function problemsIn(form: Form, consent: boolean) {
  const found: Partial<Record<keyof Form | "consent", string>> = {};
  if (form.stageName.trim().length < 2) found.stageName = "Add your stage name";
  if (!form.category) found.category = "Pick what you do";
  if (!form.city) found.city = "Pick your base city";
  if (!INDIAN_MOBILE.test(form.phone)) found.phone = "Enter a 10-digit Indian mobile number";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) found.email = "Enter a valid email";
  if (!form.links.trim()) found.links = "Add at least one link to your work";
  if (form.about.trim().length < 20) found.about = "Tell us a little more (at least a sentence or two)";
  if (!consent) found.consent = "Please confirm this to send your application";
  return found;
}

export function TalentApplicationForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof problemsIn>>({});
  const submit = useMutation({
    mutationFn: () => api.applications.submit(form),
    // Its own page: Next.js keeps this form alive between visits, so it's left empty for next time.
    onSuccess: ({ ref }) => {
      setForm(EMPTY);
      setConsent(false);
      router.push(`/for-talent/apply/received?ref=${encodeURIComponent(ref)}`);
    },
  });

  const set = (key: keyof Form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors(({ [key]: _, ...rest }) => rest);
  };

  function send() {
    const problems = problemsIn(form, consent);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return showFirstProblem();
    submit.mutate();
  }

  const section = "font-display text-sm font-semibold uppercase tracking-wide text-muted";

  return (
    <div>
      <HideFooter />
      <div className="space-y-8 rounded-card border border-line bg-white p-5 sm:p-8">
        <section className="grid gap-5 sm:grid-cols-2">
          <h2 className={`${section} sm:col-span-2`}>About you</h2>
          <Field label="Stage name" className="sm:col-span-2" error={errors.stageName}>
            {(c) => <input {...c} value={form.stageName} onChange={(e) => set("stageName", e.target.value)} maxLength={80} className={fieldClass} />}
          </Field>
          <div className="sm:col-span-2">
            <Choices label="What do you do?" options={[...CATEGORIES.map((c) => ({ value: c.name as string, label: c.name })), { value: "Other", label: "Other" }]} value={form.category} onChange={(v) => set("category", v)} error={errors.category} />
          </div>
          <div className="sm:col-span-2">
            <Choices label="Base city" options={[...CITIES.map((c) => ({ value: c.name as string, label: c.name })), { value: "Other", label: "Other" }]} value={form.city} onChange={(v) => set("city", v)} error={errors.city} />
          </div>
          <div className="sm:col-span-2">
            <Choices wide label="Who manages your bookings?" options={REPRESENTATION.map((r) => ({ value: r, label: r }))} value={form.representation} onChange={(v) => set("representation", v)} />
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <h2 className={`${section} sm:col-span-2`}>How we reach you</h2>
          <Field label="Mobile number" error={errors.phone}>
            {(c) => (
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">+91</span>
                <input {...c} value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="tel-national" className={`${fieldClass} pl-12`} />
              </div>
            )}
          </Field>
          <Field label="Email" error={errors.email}>
            {(c) => <input {...c} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" className={fieldClass} />}
          </Field>
        </section>

        <section className="grid gap-5">
          <h2 className={section}>Your work</h2>
          <Field label="Links to your work" hint="YouTube, Instagram, Spotify or a press kit, one per line." error={errors.links}>
            {(c) => <textarea {...c} value={form.links} onChange={(e) => set("links", e.target.value)} rows={3} className={fieldClass} />}
          </Field>
          <Field label="Tell us about your act" count={`${form.about.length} / 2000`} hint="What you perform, typical set length, languages, the kind of events you love." error={errors.about}>
            {(c) => <textarea {...c} value={form.about} onChange={(e) => set("about", e.target.value)} rows={5} maxLength={2000} className={fieldClass} />}
          </Field>
          <div>
            <label className="flex cursor-pointer gap-3 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  setErrors(({ consent: _, ...rest }) => rest);
                }}
                className="mt-1 size-4 accent-[var(--gold-deep)]"
              />
              <span>
                I'm the artist or authorised to apply on their behalf, and I agree to the{" "}
                <Link href="/privacy" className="underline underline-offset-2">
                  privacy policy
                </Link>
                .
              </span>
            </label>
            {errors.consent && <p role="alert" className="mt-1.5 text-xs text-rose-700">{errors.consent}</p>}
          </div>
        </section>
      </div>

      {submit.isError && <p role="alert" className="mt-4 text-sm text-rose-700">{errorMessage(submit.error)}</p>}

      <ActionBar>
        <p className="text-xs text-muted">No fee to apply or to be listed.</p>
        <button type="button" onClick={send} disabled={submit.isPending} className="btn btn-gold btn-sm disabled:opacity-60">
          {submit.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          Submit application
        </button>
      </ActionBar>
    </div>
  );
}
