"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Plus, Search, X } from "lucide-react";
import { EnquiryInputSchema, type EnquiryFormValues, type EnquiryInput } from "@repo/schemas";
import { toIstDateKey } from "@repo/utils";
import { BUDGET_BANDS, CITIES, EVENT_TYPES, LANGUAGES } from "@repo/mock/catalogue/data";
import { ApiError, api, errorMessage } from "@/lib/api/client";
import { keys, useSession, useTalentSearch, useTalentSummaries } from "@/lib/api/hooks";
import { feeBand } from "@/lib/format";
import { OtpForm } from "@/components/auth/otp-form";

const STEPS = [
  { title: "Your event", fields: ["eventType", "eventDate", "altDate", "city", "venue", "audienceSize", "durationMins", "language"] },
  { title: "Artists & budget", fields: ["talentSlugs", "budgetBand", "notes"] },
  { title: "Your details", fields: ["contactName", "phone", "email", "companyName", "gstin"] },
] as const satisfies readonly { title: string; fields: readonly FieldPath<EnquiryFormValues>[] }[];

const MAX_TALENTS = 5;
const inputClass =
  "w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold aria-[invalid=true]:border-rose-400";

const optionalNumber = (value: unknown) => (value === "" || value == null ? undefined : Number(value));

export function EnquiryForm({ initialTalents }: { initialTalents: string[] }) {
  const client = useQueryClient();
  const { data: session } = useSession();
  const [step, setStep] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState<{ ref: string; leadId: string } | null>(null);
  const today = useMemo(() => toIstDateKey(new Date()), []);

  const form = useForm<EnquiryFormValues, unknown, EnquiryInput>({
    resolver: zodResolver(EnquiryInputSchema),
    mode: "onTouched",
    defaultValues: {
      eventType: "",
      eventDate: "",
      altDate: "",
      city: "",
      venue: "",
      budgetBand: "",
      talentSlugs: [...new Set(initialTalents)].slice(0, MAX_TALENTS),
      language: "",
      notes: "",
      contactName: "",
      phone: "",
      email: "",
      companyName: "",
      gstin: "",
    },
  });
  const { register, formState, trigger, control, setValue, getValues, handleSubmit, setError } = form;
  const errors = formState.errors;
  const selected = useWatch({ control, name: "talentSlugs" }) ?? [];

  const submit = useMutation({
    mutationFn: (values: EnquiryInput) => api.enquiries.submit(values),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: keys.bookings });
      setDone(result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    // AVL-4: an artist is blocked on that date — take the customer back to the date with the reason.
    onError: (error) => {
      if (!(error instanceof ApiError) || error.code !== "DATE_BLOCKED") return;
      setVerifying(false);
      setStep(0);
      setError("eventDate", { message: error.message }, { shouldFocus: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const next = async () => {
    if (await trigger([...STEPS[step]!.fields])) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  /** Signed-in customers with the same number skip OTP; everyone else verifies first (ENQ-4). */
  const onFinalSubmit = handleSubmit((values) => {
    if (session?.roles.includes("CUSTOMER") && session.phone === values.phone) submit.mutate(values);
    else setVerifying(true);
  });

  if (done) return <Success refNo={done.ref} leadId={done.leadId} />;

  const error = (name: FieldPath<EnquiryFormValues>) => {
    const message = name.split(".").reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], errors) as
      | { message?: string }
      | undefined;
    return message?.message ? (
      <p id={`${name}-error`} role="alert" className="mt-1.5 text-xs text-rose-700">
        {message.message}
      </p>
    ) : null;
  };
  const aria = (name: FieldPath<EnquiryFormValues>) => ({
    "aria-invalid": Boolean((errors as Record<string, unknown>)[name]),
    "aria-describedby": (errors as Record<string, unknown>)[name] ? `${name}-error` : undefined,
  });
  const label = (text: string, optional = false) => (
    <span className="mb-1.5 block text-sm font-medium text-ink">
      {text}
      {optional && <span className="font-normal text-muted"> (optional)</span>}
    </span>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div>
        <ol className="mb-8 flex gap-2" aria-label="Progress">
          {STEPS.map((s, index) => (
            <li key={s.title} className="flex-1" aria-current={index === step ? "step" : undefined}>
              <span className={`block h-1 rounded-full ${index <= step ? "bg-gold" : "bg-line"}`} />
              <span className={`mt-2 block font-display text-xs font-semibold ${index === step ? "text-ink" : "text-muted"}`}>
                {index + 1}. {s.title}
              </span>
            </li>
          ))}
        </ol>

        {/*
          Not a <form>: the phone sign-in at the end (OtpForm) is its own form, and a form inside a form makes
          browsers submit the outer one natively, reloading the page and wiping the brief. Enter still moves on.
        */}
        <div
          role="group"
          aria-label="Event brief"
          onKeyDown={(e) => {
            if (verifying || e.key !== "Enter" || !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) return;
            e.preventDefault();
            if (step < STEPS.length - 1) void next();
            else void onFinalSubmit();
          }}
          className="rounded-card border border-line bg-white p-6 sm:p-8"
        >
          {step === 0 && (
            <fieldset className="grid gap-5 sm:grid-cols-2">
              <legend className="mb-5 font-serif text-2xl font-semibold text-ink">Tell us about your event</legend>
              <label className="sm:col-span-2">
                {label("Event type")}
                <select {...register("eventType")} {...aria("eventType")} className={inputClass}>
                  <option value="">Choose…</option>
                  {EVENT_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                {error("eventType")}
              </label>
              <label>
                {label("Event date")}
                <input type="date" min={today} {...register("eventDate")} {...aria("eventDate")} className={inputClass} />
                {error("eventDate")}
              </label>
              <label>
                {label("Alternate date", true)}
                <input type="date" min={today} {...register("altDate")} {...aria("altDate")} className={inputClass} />
                {error("altDate")}
              </label>
              <label>
                {label("City")}
                <select {...register("city")} {...aria("city")} className={inputClass}>
                  <option value="">Choose…</option>
                  {CITIES.map((city) => (
                    <option key={city.slug}>{city.name}</option>
                  ))}
                  <option>Other</option>
                </select>
                {error("city")}
              </label>
              <label>
                {label("Venue", true)}
                <input {...register("venue")} placeholder="Hotel, lawn, auditorium…" className={inputClass} />
              </label>
              <label>
                {label("Audience size", true)}
                <input type="number" min={1} {...register("audienceSize", { setValueAs: optionalNumber })} {...aria("audienceSize")} placeholder="e.g. 300" className={inputClass} />
                {error("audienceSize")}
              </label>
              <label>
                {label("Performance length", true)}
                <select {...register("durationMins", { setValueAs: optionalNumber })} className={inputClass}>
                  <option value="">Not sure yet</option>
                  {[30, 45, 60, 90, 120, 180].map((mins) => (
                    <option key={mins} value={mins}>
                      {mins < 60 ? `${mins} min` : `${mins / 60} hr${mins > 60 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                {label("Preferred language", true)}
                <select {...register("language")} className={inputClass}>
                  <option value="">No preference</option>
                  {LANGUAGES.map((language) => (
                    <option key={language}>{language}</option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset className="grid gap-6">
              <legend className="mb-1 font-serif text-2xl font-semibold text-ink">Who would you like?</legend>
              <TalentPicker
                selected={selected}
                onChange={(slugs) => setValue("talentSlugs", slugs, { shouldValidate: true })}
              />
              {error("talentSlugs")}
              <label>
                {label("Total budget for the artist(s)")}
                <select {...register("budgetBand")} {...aria("budgetBand")} className={inputClass}>
                  <option value="">Choose a range…</option>
                  {BUDGET_BANDS.map((band) => (
                    <option key={band.id} value={band.id}>
                      {band.label}
                    </option>
                  ))}
                </select>
                {error("budgetBand")}
              </label>
              <label>
                {label("Anything else we should know?", true)}
                <textarea
                  rows={4}
                  {...register("notes")}
                  {...aria("notes")}
                  placeholder="Set list ideas, dress code, stage size, who's in the audience…"
                  className={inputClass}
                />
                {error("notes")}
              </label>
            </fieldset>
          )}

          {step === 2 && !verifying && (
            <fieldset className="grid gap-5 sm:grid-cols-2">
              <legend className="mb-5 font-serif text-2xl font-semibold text-ink">How do we reach you?</legend>
              <label>
                {label("Full name")}
                <input autoComplete="name" {...register("contactName")} {...aria("contactName")} className={inputClass} />
                {error("contactName")}
              </label>
              <label>
                {label("Mobile number")}
                <input
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit mobile"
                  {...register("phone", { setValueAs: (v: string) => String(v ?? "").replace(/\D/g, "").slice(-10) })}
                  {...aria("phone")}
                  className={inputClass}
                />
                {error("phone")}
              </label>
              <label className="sm:col-span-2">
                {label("Email", true)}
                <input type="email" autoComplete="email" {...register("email")} {...aria("email")} className={inputClass} />
                {error("email")}
              </label>
              <label>
                {label("Company", true)}
                <input autoComplete="organization" {...register("companyName")} className={inputClass} />
              </label>
              <label>
                {label("GSTIN", true)}
                <input {...register("gstin")} {...aria("gstin")} placeholder="For a GST invoice" className={`${inputClass} uppercase`} />
                {error("gstin")}
              </label>
              <p className="text-xs leading-relaxed text-muted sm:col-span-2">
                We use these details only to work on your booking. Read our{" "}
                <Link href="/privacy" className="underline underline-offset-2">
                  privacy policy
                </Link>
                .
              </p>
            </fieldset>
          )}

          {step === 2 && verifying && (
            <div className="mx-auto max-w-sm">
              <h2 className="font-serif text-2xl font-semibold text-ink">Verify your number</h2>
              <p className="mt-2 text-sm text-muted">One quick step so we know the brief is really from you.</p>
              <div className="mt-6">
                <OtpForm
                  as="customer"
                  defaultPhone={getValues("phone")}
                  defaultName={getValues("contactName")}
                  submitLabel="Verify and send brief"
                  onVerified={() => submit.mutateAsync(EnquiryInputSchema.parse(getValues())).then(() => undefined)}
                />
              </div>
              {submit.isError && (
                <p role="alert" className="mt-4 text-sm text-rose-700">
                  {errorMessage(submit.error)}
                </p>
              )}
              <button type="button" onClick={() => setVerifying(false)} className="mt-4 text-sm text-muted hover:text-ink">
                ← Edit details
              </button>
            </div>
          )}

          {!verifying && (
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-6">
              {step > 0 ? (
                <button type="button" onClick={() => setStep((s) => s - 1)} className="btn btn-outline">
                  <ArrowLeft aria-hidden />
                  Back
                </button>
              ) : (
                <span />
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={next} className="btn btn-dark">
                  Continue
                  <ArrowRight aria-hidden />
                </button>
              ) : (
                <button type="button" onClick={onFinalSubmit} disabled={submit.isPending} className="btn btn-gold disabled:opacity-60">
                  {submit.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                  Send brief
                  {!submit.isPending && <ArrowRight aria-hidden />}
                </button>
              )}
            </div>
          )}
          {submit.isError && !verifying && (
            <p role="alert" className="mt-4 text-sm text-rose-700">
              {errorMessage(submit.error)}
            </p>
          )}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-card bg-ink p-6 text-white">
          <p className="eyebrow text-warm">What happens next</p>
          <ol className="mt-4 space-y-3 text-sm text-white/80">
            <li>1. You get a reference number straight away.</li>
            <li>2. A booking manager calls to go through your brief.</li>
            <li>3. We check each artist's date with their team.</li>
            <li>4. You receive an itemised quote to accept online.</li>
          </ol>
        </div>
        <p className="px-1 text-xs leading-relaxed text-muted">
          Sending a brief is free and doesn't commit you to anything. Nothing is confirmed until you've accepted a quote,
          signed the contract and paid the advance.
        </p>
      </aside>
    </div>
  );
}

function TalentPicker({ selected, onChange }: { selected: string[]; onChange: (slugs: string[]) => void }) {
  const [query, setQuery] = useState("");
  const chosen = useTalentSummaries(selected);
  const search = useTalentSearch(query);
  const matches = (search.data ?? []).filter((t) => !selected.includes(t.slug)).slice(0, 5);

  // Slugs from a link (?talent=…) that the catalogue doesn't know drop out quietly.
  useEffect(() => {
    if (!chosen.data || chosen.isFetching) return;
    const known = selected.filter((slug) => chosen.data.some((t) => t.slug === slug));
    if (known.length !== selected.length) onChange(known);
  }, [chosen.data, chosen.isFetching, selected, onChange]);

  const full = selected.length >= MAX_TALENTS;

  return (
    <div>
      {selected.length > 0 ? (
        <ul className="grid gap-2">
          {selected.map((slug) => {
            const talent = chosen.data?.find((t) => t.slug === slug);
            if (!talent) return null;
            return (
              <li key={slug} className="flex items-center gap-3 rounded-xl border border-line p-2.5 pr-3">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-cream">
                  <Image src={`${talent.photo}&w=96&h=96`} alt="" fill sizes="48px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-sm font-semibold text-ink">{talent.stageName}</span>
                  <span className="block truncate text-xs text-muted">
                    {talent.headline} · {feeBand(talent)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((s) => s !== slug))}
                  aria-label={`Remove ${talent.stageName}`}
                  className="grid size-8 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl bg-cream-soft px-4 py-3 text-sm text-muted">
          No artist in mind? That's fine — leave this empty and we'll suggest options that fit your brief.
        </p>
      )}

      {!full && (
        <div className="relative mt-3">
          <label className="relative block">
            <span className="sr-only">Add an artist</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add an artist by name or category…"
              className={`${inputClass} pl-10`}
            />
          </label>
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-card">
              {matches.map((t) => (
                <li key={t.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...selected, t.slug]);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-cream-soft"
                  >
                    <span>
                      <span className="font-semibold text-ink">{t.stageName}</span>
                      <span className="text-muted"> · {t.headline}</span>
                    </span>
                    <Plus className="size-4 text-gold-deep" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Up to {MAX_TALENTS} artists. We'll check each one's date separately.</p>
    </div>
  );
}

function Success({ refNo, leadId }: { refNo: string; leadId: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-card border border-line bg-white p-8 text-center shadow-card sm:p-10">
      <CheckCircle2 className="mx-auto size-14 text-emerald-600" aria-hidden />
      <h2 className="mt-5 font-serif text-3xl font-semibold text-ink">Brief received</h2>
      <p className="mt-3 text-muted">Your reference number is</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-wide text-gold-deep">{refNo}</p>
      <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted">
        We've sent the same reference to your phone and email. A booking manager will call you shortly to go through the
        details, then check each artist's availability.
      </p>
      <p className="mt-2 text-xs text-muted">(Demo mode: no SMS or email is actually sent.)</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/account/bookings/${leadId}`} className="btn btn-dark">
          Track this booking
          <ArrowRight aria-hidden />
        </Link>
        <Link href="/talent" className="btn btn-outline">
          Keep browsing
        </Link>
      </div>
    </div>
  );
}
