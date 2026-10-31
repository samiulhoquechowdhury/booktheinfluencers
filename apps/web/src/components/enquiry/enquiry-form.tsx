"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CloudCheck, LoaderCircle, Plus, Search, X } from "lucide-react";
import { dateClashMessage, EnquiryInputSchema, type EnquiryFormValues, type EnquiryInput } from "@repo/schemas";
import { formatDate, toIstDateKey } from "@repo/utils";
import { BUDGET_BANDS, CITIES, EVENT_TYPES, LANGUAGES } from "@repo/mock/catalogue/data";
import { ApiError, api, errorMessage } from "@/lib/api/client";
import { blockedDatesQuery, keys, useSession, useTalentSearch, useTalentSummaries } from "@/lib/api/hooks";
import { feeBand } from "@/lib/format";
import { OtpForm } from "@/components/auth/otp-form";
import { isUploaded, photoAt } from "@/lib/photo";
import { AvailabilityCalendar } from "@/components/talent/availability-calendar";
import { ActionBar, Choices, HideFooter, StepRail, showFirstProblem } from "@/components/ui/form-steps";

const STEPS = [
  { title: "Your event", hint: "When, where and what", fields: ["eventType", "eventDate", "altDate", "city", "venue", "audienceSize", "durationMins", "language"] },
  { title: "Artists & budget", hint: "Who you'd like", fields: ["talentSlugs", "budgetBand", "notes"] },
  { title: "Your details", hint: "How we reach you", fields: ["contactName", "phone", "email", "companyName", "gstin"] },
] as const satisfies readonly { title: string; hint: string; fields: readonly FieldPath<EnquiryFormValues>[] }[];

/** The event part of a brief is kept on this device, so a reload doesn't lose it. Contact details aren't stored. */
const DRAFT_KEY = "enquiry-draft";
const DRAFT_FIELDS = ["eventType", "eventDate", "altDate", "city", "venue", "audienceSize", "durationMins", "language", "budgetBand", "notes"] as const;
const DURATIONS = [30, 45, 60, 90, 120, 180].map((mins) => ({ value: mins, label: mins < 60 ? `${mins} min` : `${mins / 60} hr${mins > 60 ? "s" : ""}` }));

const MAX_TALENTS = 5;
const inputClass =
  "w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold aria-[invalid=true]:border-rose-400";

const optionalNumber = (value: unknown) => (value === "" || value == null ? undefined : Number(value));

export function EnquiryForm({ initialTalents, initialDate }: { initialTalents: string[]; initialDate?: string }) {
  const client = useQueryClient();
  const { data: session } = useSession();
  const [step, setStep] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();
  const today = useMemo(() => toIstDateKey(new Date()), []);

  const form = useForm<EnquiryFormValues, unknown, EnquiryInput>({
    resolver: zodResolver(EnquiryInputSchema),
    mode: "onTouched",
    defaultValues: {
      eventType: "",
      eventDate: initialDate ?? "",
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
  const { register, formState, trigger, control, setValue, getValues, handleSubmit, setError, reset, watch } = form;
  const errors = formState.errors;
  const selected = useWatch({ control, name: "talentSlugs" }) ?? [];
  const eventDate = useWatch({ control, name: "eventDate" });
  const altDate = useWatch({ control, name: "altDate" });
  const values = useWatch({ control });

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<EnquiryFormValues> | null;
      if (!draft) return;
      const fresh = (date: string | undefined) => (date && date >= today ? date : "");
      reset({ ...getValues(), ...draft, eventDate: initialDate ?? fresh(draft.eventDate), altDate: fresh(draft.altDate) });
    } catch {
      // Nothing usable saved.
    }
  }, [getValues, initialDate, reset, today]);

  // Only what the customer changes is saved (`name` is empty for a reset), so restoring can't overwrite the draft.
  useEffect(() => {
    const { unsubscribe } = watch((current, { name }) => {
      if (!name) return;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(DRAFT_FIELDS.map((field) => [field, current[field]]))));
      } catch {
        // Storage full or blocked: the form still works, it just won't survive a reload.
      }
    });
    return unsubscribe;
  }, [watch]);

  // Signed-in customers don't retype what we already know.
  useEffect(() => {
    if (!session) return;
    if (!getValues("contactName") && session.name !== "Guest") setValue("contactName", session.name);
    if (!getValues("phone")) setValue("phone", session.phone);
    if (!getValues("email") && session.email) setValue("email", session.email);
  }, [session, getValues, setValue]);

  const shortlist = useTalentSummaries(selected);
  const calendars = useQueries({ queries: selected.map(blockedDatesQuery) });

  /** Who on the shortlist can't do this date, so the customer finds out now, not after filling in the whole brief. */
  const blockedOn = (date: string | undefined) => (date ? selected.filter((_, i) => calendars[i]?.data?.dates.includes(date)) : []);
  const clash = (date: string | undefined) => {
    const slugs = blockedOn(date);
    if (slugs.length === 0) return null;
    const names = slugs.map((slug) => shortlist.data?.find((t) => t.slug === slug)?.stageName ?? "This artist");
    const allBooked = slugs.every((slug) => calendars[selected.indexOf(slug)]?.data?.booked.includes(date!));
    return dateClashMessage(names, formatDate(`${date}T12:00:00+05:30`), allBooked);
  };
  // The date to fix first, with the calendar of free days that goes with it.
  const clashing = clash(eventDate) ? { field: "eventDate" as const, date: eventDate } : clash(altDate) ? { field: "altDate" as const, date: altDate! } : null;

  const submit = useMutation({
    mutationFn: (values: EnquiryInput) => api.enquiries.submit(values),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: keys.bookings });
      // The confirmation is its own page. Next.js keeps this form alive between visits, so it must be left ready for
      // the customer's next booking, with their contact details kept and the event cleared.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Blocked storage: there was no draft to clear.
      }
      reset({ ...getValues(), eventType: "", eventDate: "", altDate: "", city: "", venue: "", audienceSize: undefined, durationMins: undefined, language: "", budgetBand: "", notes: "" });
      setStep(0);
      setVerifying(false);
      router.push(`/enquiry/received?ref=${encodeURIComponent(result.ref)}&lead=${encodeURIComponent(result.leadId)}`);
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
    if (clash(eventDate) || clash(altDate)) {
      setStep(0); // an artist added on the next step can clash with the date picked on this one
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (await trigger([...STEPS[step]!.fields])) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      showFirstProblem();
    }
  };

  const choose = <K extends "eventType" | "city" | "durationMins" | "budgetBand">(name: K, value: EnquiryFormValues[K]) => setValue(name, value as never, { shouldValidate: true, shouldDirty: true });
  const problem = (name: "eventType" | "city" | "budgetBand") => errors[name]?.message;

  /** Signed-in customers with the same number skip OTP; everyone else verifies first (ENQ-4). */
  const onFinalSubmit = handleSubmit((values) => {
    if (session?.roles.includes("CUSTOMER") && session.phone === values.phone) submit.mutate(values);
    else setVerifying(true);
  });

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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
      <HideFooter />
      <StepRail
        steps={STEPS.map((s, index) => ({ key: s.title, label: s.title, hint: s.hint, complete: index < step }))}
        current={STEPS[step]!.title}
        percent={Math.round((step / STEPS.length) * 100)}
        status={`${Math.round((step / STEPS.length) * 100)}% complete`}
        onSelect={(key) => {
          const target = STEPS.findIndex((s) => s.title === key);
          if (target < step && !verifying) setStep(target); // going forward goes through Continue, which checks the step
        }}
      />

      <div className="min-w-0">
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
              <div className="sm:col-span-2">
                <Choices label="What's the occasion?" options={EVENT_TYPES.map((type) => ({ value: type as string, label: type }))} value={values.eventType} onChange={(v) => choose("eventType", v)} error={problem("eventType")} />
              </div>
              <label>
                {label("Event date")}
                <input type="date" min={today} {...register("eventDate")} {...aria("eventDate")} className={inputClass} />
                {clash(eventDate) ? <p role="alert" className="mt-1.5 text-xs text-rose-700">{clash(eventDate)}</p> : error("eventDate")}
              </label>
              <label>
                {label("Alternate date", true)}
                <input type="date" min={today} {...register("altDate")} {...aria("altDate")} className={inputClass} />
                {clash(altDate) ? <p role="alert" className="mt-1.5 text-xs text-rose-700">{clash(altDate)}</p> : error("altDate")}
              </label>
              {clashing && (
                <div className="sm:col-span-2">
                  <AvailabilityCalendar
                    key={blockedOn(clashing.date).join()}
                    slugs={blockedOn(clashing.date)}
                    start={clashing.date}
                    heading="Choose a date they're free"
                    onPick={(date) => setValue(clashing.field, date, { shouldValidate: true })}
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <Choices label="City" options={[...CITIES.map((city) => ({ value: city.name as string, label: city.name })), { value: "Other", label: "Other" }]} value={values.city} onChange={(v) => choose("city", v)} error={problem("city")} />
              </div>
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
                {label("Preferred language", true)}
                <select {...register("language")} className={inputClass}>
                  <option value="">No preference</option>
                  {LANGUAGES.map((language) => (
                    <option key={language}>{language}</option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <Choices label="Performance length" optional options={DURATIONS} value={values.durationMins as number | undefined} onChange={(v) => choose("durationMins", (values.durationMins === v ? undefined : v) as never)} hint="Not sure yet? Leave this and we'll work it out together." />
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset className="grid gap-6">
              <legend className="mb-1 font-serif text-2xl font-semibold text-ink">Who would you like?</legend>
              <TalentPicker
                selected={selected}
                unavailable={[...blockedOn(eventDate), ...blockedOn(altDate)]}
                onChange={(slugs) => setValue("talentSlugs", slugs, { shouldValidate: true })}
              />
              {error("talentSlugs")}
              <Choices wide label="Total budget for the artist(s)" options={BUDGET_BANDS.map((band) => ({ value: band.id as string, label: band.label }))} value={values.budgetBand} onChange={(v) => choose("budgetBand", v)} error={problem("budgetBand")} />
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

          {submit.isError && !verifying && (
            <p role="alert" className="mt-4 text-sm text-rose-700">
              {errorMessage(submit.error)}
            </p>
          )}
        </div>

        {!verifying && (
          <ActionBar>
            {step > 0 ? (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="btn btn-outline btn-sm">
                <ArrowLeft aria-hidden />
                Back
              </button>
            ) : (
              <span />
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <CloudCheck className="size-3.5" aria-hidden />
              <span className="sm:hidden">Saved</span>
              <span className="hidden sm:inline">Saved on this device</span>
            </p>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="btn btn-gold btn-sm">
                Continue
                <ArrowRight aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={onFinalSubmit} disabled={submit.isPending} className="btn btn-gold btn-sm disabled:opacity-60">
                {submit.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                Send brief
                {!submit.isPending && <ArrowRight aria-hidden />}
              </button>
            )}
          </ActionBar>
        )}
      </div>

      <aside className="min-w-0 space-y-4 lg:col-start-2 xl:sticky xl:top-24 xl:col-start-3 xl:row-start-1 xl:self-start">
        <BriefSummary
          rows={[
            ["Occasion", values.eventType],
            ["Date", values.eventDate && formatDate(`${values.eventDate}T12:00:00+05:30`)],
            ["Alternate", values.altDate && formatDate(`${values.altDate}T12:00:00+05:30`)],
            ["City", values.city],
            ["Length", DURATIONS.find((d) => d.value === values.durationMins)?.label],
            ["Artists", shortlist.data?.filter((t) => selected.includes(t.slug)).map((t) => t.stageName).join(", ")],
            ["Budget", BUDGET_BANDS.find((band) => band.id === values.budgetBand)?.label],
          ]}
        />
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

function BriefSummary({ rows }: { rows: [string, string | undefined | false][] }) {
  const filled = rows.filter(([, value]) => value);
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <h2 className="font-display text-sm font-semibold text-ink">Your brief</h2>
      {filled.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Your choices will appear here as you go.</p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          {filled.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted">{label}</dt>
              <dd className="text-right font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function TalentPicker({ selected, unavailable, onChange }: { selected: string[]; unavailable: string[]; onChange: (slugs: string[]) => void }) {
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
                  <Image src={photoAt(talent.photo, 96, 96)} unoptimized={isUploaded(talent.photo)} alt="" fill sizes="48px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-sm font-semibold text-ink">{talent.stageName}</span>
                  <span className="block truncate text-xs text-muted">
                    {talent.headline} · {feeBand(talent)}
                  </span>
                  {unavailable.includes(slug) && <span className="block text-xs font-medium text-rose-700">Not available on your date</span>}
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
