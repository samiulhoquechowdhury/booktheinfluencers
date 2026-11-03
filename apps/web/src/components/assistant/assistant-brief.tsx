"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Plus, Search, X } from "lucide-react";
import { EVENT_TYPES, dateClashMessage, EnquiryInputSchema, type AssistantBooking, type EnquiryFormValues, type EnquiryInput } from "@repo/schemas";
import { formatDate, toIstDateKey } from "@repo/utils";
import { BUDGET_BANDS, CITIES } from "@repo/mock/catalogue/data";
import { ApiError, api, errorMessage } from "@/lib/api/client";
import { blockedDatesQuery, keys, useSession, useTalentSearch, useTalentSummaries } from "@/lib/api/hooks";
import { isUploaded, photoAt } from "@/lib/photo";
import { OtpForm } from "@/components/auth/otp-form";

export const MAX_ARTISTS = 5;

/** The brief being put together in the chat. Contact fields stay undefined until typed, so a signed-in customer's own details show instead. */
export type Brief = {
  talentSlugs: string[];
  eventType: string;
  eventDate: string;
  city: string;
  budgetBand: string;
  notes: string;
  contactName?: string;
  phone?: string;
  email?: string;
};

export const EMPTY_BRIEF: Brief = { talentSlugs: [], eventType: "", eventDate: "", city: "", budgetBand: "", notes: "" };

/** What the assistant picked up, laid over what the customer already has. Cities are matched to the ones we cover. */
export function withDraft(brief: Brief, draft: AssistantBooking): Brief {
  const wanted = draft.city?.toLowerCase();
  const city = wanted ? CITIES.find((c) => c.name.toLowerCase() === wanted || c.name.toLowerCase().startsWith(wanted) || wanted.startsWith(c.name.toLowerCase()))?.name : undefined;
  return {
    ...brief,
    talentSlugs: [...new Set([...brief.talentSlugs, ...draft.talentSlugs])].slice(0, MAX_ARTISTS),
    eventDate: draft.date ?? brief.eventDate,
    city: city ?? brief.city,
    eventType: draft.eventType ?? brief.eventType,
    budgetBand: draft.budgetBand ?? brief.budgetBand,
  };
}

type Field = keyof Brief;
type Sent = { ref: string; leadId: string };

const input = "w-full rounded-md border border-line bg-white px-3 py-2 text-base text-ink outline-none focus:border-gold aria-[invalid=true]:border-rose-400 sm:text-sm";

/** Send a brief without leaving the chat: the same brief as the enquiry page, on one short screen. */
export function AssistantBrief({ brief, onChange, onSent, onBack }: { brief: Brief; onChange: (patch: Partial<Brief>) => void; onSent: (sent: Sent) => void; onBack: () => void }) {
  const client = useQueryClient();
  const { data: session } = useSession();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [term, setTerm] = useState("");
  const search = useTalentSearch(term);

  const customer = session?.roles.includes("CUSTOMER") ? session : null;
  const contact = {
    contactName: brief.contactName ?? (customer && customer.name !== "Guest" ? customer.name : ""),
    phone: brief.phone ?? customer?.phone ?? "",
    email: brief.email ?? customer?.email ?? "",
  };

  const artists = useTalentSummaries(brief.talentSlugs);
  const calendars = useQueries({ queries: brief.talentSlugs.map(blockedDatesQuery) });
  const blocked = brief.eventDate ? brief.talentSlugs.filter((_, i) => calendars[i]?.data?.dates.includes(brief.eventDate)) : [];
  const nameOf = (slug: string) => artists.data?.find((t) => t.slug === slug)?.stageName ?? "This artist";
  const clash = blocked.length
    ? dateClashMessage(
        blocked.map(nameOf),
        formatDate(`${brief.eventDate}T12:00:00+05:30`),
        blocked.every((slug) => calendars[brief.talentSlugs.indexOf(slug)]?.data?.booked.includes(brief.eventDate)),
      )
    : null;

  const set = (patch: Partial<Brief>) => {
    onChange(patch);
    setErrors((all) => Object.fromEntries(Object.entries(all).filter(([key]) => !(key in patch))));
  };
  const toggle = (slug: string) => set({ talentSlugs: brief.talentSlugs.includes(slug) ? brief.talentSlugs.filter((s) => s !== slug) : [...brief.talentSlugs, slug].slice(0, MAX_ARTISTS) });

  const submit = useMutation({
    mutationFn: (values: EnquiryInput) => api.enquiries.submit(values),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: keys.bookings });
      setVerifying(false);
      setSent(result);
      onSent(result);
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || error.code !== "DATE_BLOCKED") return;
      setVerifying(false);
      setErrors({ eventDate: error.message });
    },
  });

  const values = (): EnquiryFormValues => ({ ...brief, ...contact, altDate: "", venue: "", language: "", companyName: "", gstin: "" });

  function send() {
    const parsed = EnquiryInputSchema.safeParse(values());
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) found[issue.path[0] as Field] ??= issue.message;
      setErrors(found);
      document.getElementById(`brief-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    if (clash) return document.getElementById("brief-eventDate")?.focus();
    if (customer && customer.phone === parsed.data.phone) submit.mutate(parsed.data);
    else setVerifying(true);
  }

  if (sent) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto bg-cream-soft p-6 text-center">
        <CheckCircle2 className="size-12 text-emerald-600" aria-hidden />
        <h3 className="font-serif text-2xl font-semibold text-ink">Brief sent</h3>
        <p className="text-sm text-muted">Your reference is</p>
        <p className="font-display text-xl font-bold tracking-wide text-gold-deep">{sent.ref}</p>
        <p className="text-sm leading-relaxed text-muted">A booking manager will call you shortly, check each artist&apos;s date and send you a quote.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href={`/account/bookings/${encodeURIComponent(sent.leadId)}`} className="btn btn-dark btn-sm">
            Track this booking
            <ArrowRight aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => {
              setSent(null);
              onBack();
            }}
            className="btn btn-sm cursor-pointer border border-line bg-white text-ink"
          >
            Back to chat
          </button>
        </div>
      </div>
    );
  }

  if (verifying) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4">
        <button type="button" onClick={() => setVerifying(false)} className="mb-3 flex cursor-pointer items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to the brief
        </button>
        <h3 className="font-serif text-xl font-semibold text-ink">Verify your number</h3>
        <p className="mb-4 mt-1 text-sm text-muted">One quick step so we know the brief is really from you.</p>
        <OtpForm
          as="customer"
          defaultPhone={contact.phone}
          defaultName={contact.contactName}
          submitLabel="Verify and send brief"
          onVerified={(session) => submit.mutateAsync(EnquiryInputSchema.parse({ ...values(), phone: session.phone })).then(() => undefined)}
        />
        {submit.isError && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {errorMessage(submit.error)}
          </p>
        )}
      </div>
    );
  }

  const problem = (field: Field) =>
    errors[field] ? (
      <p id={`brief-${field}-error`} role="alert" className="mt-1 text-xs text-rose-700">
        {errors[field]}
      </p>
    ) : null;
  const aria = (field: Field) => ({ id: `brief-${field}`, "aria-invalid": Boolean(errors[field]) || undefined, "aria-describedby": errors[field] ? `brief-${field}-error` : undefined });
  const label = "mb-1 block text-xs font-semibold text-ink";
  const matches = (search.data ?? []).filter((t) => !brief.talentSlugs.includes(t.slug)).slice(0, 4);

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-white p-4">
        <p className="text-sm text-muted">Free and with no commitment. Our team confirms the date with each artist and sends you a quote.</p>

        <section aria-labelledby="brief-artists">
          <h3 id="brief-artists" className={label}>
            Artists <span className="font-normal text-muted">(optional, up to {MAX_ARTISTS})</span>
          </h3>
          {brief.talentSlugs.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {brief.talentSlugs.map((slug) => {
                const talent = artists.data?.find((t) => t.slug === slug);
                const taken = blocked.includes(slug);
                return (
                  <li key={slug} className={`flex items-center gap-2 rounded-md border p-1.5 ${taken ? "border-rose-200 bg-rose-50" : "border-line"}`}>
                    <span className="relative size-8 shrink-0 overflow-hidden rounded bg-cream">
                      {talent && <Image src={photoAt(talent.photo, 64, 64)} unoptimized={isUploaded(talent.photo)} alt="" fill sizes="32px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{talent?.stageName ?? "Loading"}</span>
                      {taken && <span className="block text-xs text-rose-700">Not free on this date</span>}
                    </span>
                    <button type="button" aria-label={`Remove ${talent?.stageName ?? "artist"}`} onClick={() => toggle(slug)} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded text-muted hover:bg-cream hover:text-ink">
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {brief.talentSlugs.length < MAX_ARTISTS && (
            <div>
              <label className="relative block">
                <span className="sr-only">Add an artist by name</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Add an artist by name" className={`${input} pl-9`} autoComplete="off" />
              </label>
              {term.trim() && (
                <ul className="mt-1 rounded-md border border-line">
                  {search.isPending && <li className="px-3 py-2 text-xs text-muted">Searching</li>}
                  {search.isSuccess && matches.length === 0 && <li className="px-3 py-2 text-xs text-muted">No artist by that name</li>}
                  {matches.map((t) => (
                    <li key={t.slug}>
                      <button
                        type="button"
                        onClick={() => {
                          toggle(t.slug);
                          setTerm("");
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cream"
                      >
                        <Plus className="size-4 text-gold-deep" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{t.stageName}</span>
                        <span className="truncate text-xs text-muted">{t.baseCity}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className={label}>Event type</span>
            <select value={brief.eventType} onChange={(e) => set({ eventType: e.target.value })} {...aria("eventType")} className={input}>
              <option value="">Choose</option>
              {EVENT_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            {problem("eventType")}
          </label>
          <label className="block">
            <span className={label}>Date</span>
            <input type="date" value={brief.eventDate} min={toIstDateKey(new Date())} onChange={(e) => set({ eventDate: e.target.value })} {...aria("eventDate")} aria-invalid={Boolean(errors.eventDate || clash) || undefined} className={input} />
          </label>
          <label className="block">
            <span className={label}>City</span>
            <select value={brief.city} onChange={(e) => set({ city: e.target.value })} {...aria("city")} className={input}>
              <option value="">Choose</option>
              {CITIES.map((c) => (
                <option key={c.slug}>{c.name}</option>
              ))}
            </select>
          </label>
          <div className="col-span-2 -mt-2 empty:hidden">
            {problem("eventDate")}
            {clash && !errors.eventDate && (
              <p role="alert" className="mt-1 text-xs text-rose-700">
                {clash}
              </p>
            )}
            {problem("city")}
          </div>
          <label className="col-span-2 block">
            <span className={label}>Budget</span>
            <select value={brief.budgetBand} onChange={(e) => set({ budgetBand: e.target.value })} {...aria("budgetBand")} className={input}>
              <option value="">Choose a range</option>
              {BUDGET_BANDS.map((band) => (
                <option key={band.id} value={band.id}>
                  {band.label}
                </option>
              ))}
            </select>
            {problem("budgetBand")}
          </label>
          <label className="col-span-2 block">
            <span className={label}>
              Anything else? <span className="font-normal text-muted">(optional)</span>
            </span>
            <textarea value={brief.notes} onChange={(e) => set({ notes: e.target.value })} {...aria("notes")} rows={2} maxLength={1000} placeholder="Venue, timings, songs you'd love" className={`${input} resize-none`} />
            {problem("notes")}
          </label>
        </div>

        <fieldset className="grid grid-cols-2 gap-3 border-t border-line pt-4">
          <legend className="sr-only">Your details</legend>
          <label className="col-span-2 block">
            <span className={label}>Your name</span>
            <input value={contact.contactName} onChange={(e) => set({ contactName: e.target.value })} {...aria("contactName")} autoComplete="name" className={input} />
            {problem("contactName")}
          </label>
          <label className="block">
            <span className={label}>Mobile</span>
            <input value={contact.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(-10) })} {...aria("phone")} inputMode="numeric" autoComplete="tel-national" placeholder="10 digits" className={input} />
          </label>
          <label className="block">
            <span className={label}>
              Email <span className="font-normal text-muted">(optional)</span>
            </span>
            <input type="email" value={contact.email} onChange={(e) => set({ email: e.target.value })} {...aria("email")} autoComplete="email" className={input} />
          </label>
          <div className="col-span-2 -mt-2 empty:hidden">
            {problem("phone")}
            {problem("email")}
          </div>
        </fieldset>
      </div>

      <div className="shrink-0 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {submit.isError && !(submit.error instanceof ApiError && submit.error.code === "DATE_BLOCKED") && (
          <p role="alert" className="mb-2 text-sm text-rose-700">
            {errorMessage(submit.error)}
          </p>
        )}
        <button type="button" onClick={send} disabled={submit.isPending} className="btn btn-gold w-full cursor-pointer disabled:opacity-60">
          {submit.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Send brief
          {!submit.isPending && <ArrowRight aria-hidden />}
        </button>
      </div>
    </>
  );
}
