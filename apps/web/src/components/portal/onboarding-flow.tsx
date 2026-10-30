"use client";

import Image from "next/image";
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock, ImagePlus, LoaderCircle, Plus, ShieldCheck, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import {
  ID_DOCUMENT_MIMES,
  ID_DOCUMENT_TYPES,
  MAX_GALLERY_PHOTOS,
  MAX_ID_DOCUMENT_BYTES,
  OnboardingProfileSchema,
  SOCIAL_PLATFORMS,
  type IdDocumentType,
  type OnboardingProfile,
  type OnboardingState,
} from "@repo/schemas";
import { CATEGORIES } from "@repo/mock/catalogue/data";
import { api, errorMessage } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import { prepareArtistPhoto } from "@/lib/image";
import { isUploaded } from "@/lib/photo";
import { DocumentLink, ProfileSummary } from "./profile-summary";

// Shown in place of the portal until an artist is approved: their profile, photos, social links and ID, then review.

const STEPS = [
  { key: "details", label: "Your details" },
  { key: "photos", label: "Photos" },
  { key: "social", label: "Social media" },
  { key: "documents", label: "ID documents" },
  { key: "review", label: "Review" },
] as const;
type Step = (typeof STEPS)[number]["key"];

const inputClass = "mt-1.5 w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold";

export function OnboardingFlow({ state }: { state: OnboardingState }) {
  if (state.status === "SUBMITTED") return <UnderReview state={state} />;
  return <Wizard state={state} />;
}

function UnderReview({ state }: { state: OnboardingState }) {
  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-card border border-sky-200 bg-sky-50 p-5 text-sky-900">
        <Clock className="size-6 shrink-0" aria-hidden />
        <div>
          <p className="font-display font-semibold">We're reviewing your profile</p>
          <p className="mt-1 text-sm">Our talent team is checking your details and documents. We'll text you when it's done. Your profile stays private until it's approved.</p>
        </div>
      </div>
      <ProfileSummary profile={state.profile} documents={state.documents} />
    </div>
  );
}

function Wizard({ state }: { state: OnboardingState }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<OnboardingProfile>(state.profile);
  const [step, setStep] = useState<Step>(state.missing[0]?.step ?? "review");
  const [error, setError] = useState("");
  const index = STEPS.findIndex((s) => s.key === step);

  const save = useMutation({
    mutationFn: api.talent.onboarding.save,
    onSuccess: (next) => client.setQueryData(keys.onboarding, next),
  });

  /** Keeps progress on every step change, so nothing is lost if they come back later. */
  function persist(profile: OnboardingProfile, then?: () => void) {
    const parsed = OnboardingProfileSchema.safeParse(profile);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError("");
    save.mutate(parsed.data, { onSuccess: () => then?.(), onError: (err) => setError(errorMessage(err)) });
  }

  const go = (next: Step) => persist(draft, () => setStep(next));
  const set = (patch: Partial<OnboardingProfile>) => setDraft((d) => ({ ...d, ...patch }));
  /** Uploaded photos are saved straight away. */
  const setAndSave = (patch: Partial<OnboardingProfile>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    persist(next);
  };

  return (
    <div>
      {state.status === "REJECTED" && (
        <div role="alert" className="mb-5 flex gap-3 rounded-card border border-rose-200 bg-rose-50 p-5 text-rose-900">
          <TriangleAlert className="size-6 shrink-0" aria-hidden />
          <div>
            <p className="font-display font-semibold">Please fix this and send it again</p>
            <p className="mt-1 whitespace-pre-line text-sm">{state.reviewNote}</p>
          </div>
        </div>
      )}

      <ol className="flex gap-1 overflow-x-auto rounded-md bg-cream p-1">
        {STEPS.map((s, i) => {
          const done = !state.missing.some((m) => m.step === s.key);
          return (
            <li key={s.key} className="flex-1">
              <button
                type="button"
                onClick={() => go(s.key)}
                disabled={save.isPending}
                aria-current={s.key === step ? "step" : undefined}
                className={`flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded px-3 py-2 font-display text-sm font-semibold ${s.key === step ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {s.key !== "review" && done ? <Check className="size-4 text-emerald-600" aria-hidden /> : <span aria-hidden>{i + 1}.</span>}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        {step === "details" && <Details draft={draft} set={set} />}
        {step === "photos" && <Photos draft={draft} onChange={setAndSave} />}
        {step === "social" && <Social draft={draft} set={set} />}
        {step === "documents" && <Documents state={state} />}
        {step === "review" && <Review state={state} onFix={go} />}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}

      {step !== "review" && (
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <button type="button" disabled={index === 0 || save.isPending} onClick={() => go(STEPS[index - 1]!.key)} className="btn btn-outline disabled:invisible">
            <ArrowLeft aria-hidden />
            Back
          </button>
          <button type="button" disabled={save.isPending} onClick={() => go(STEPS[index + 1]!.key)} className="btn btn-gold disabled:opacity-60">
            {save.isPending ? "Saving…" : "Save and continue"}
            <ArrowRight aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-6 sm:p-8">
      <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Comma-separated values. Keeps what's typed, so a trailing comma isn't eaten. */
function ListInput({ label, hint, values, onChange }: { label: string; hint: string; values: string[]; onChange: (values: string[]) => void }) {
  const [text, setText] = useState(values.join(", "));
  return (
    <label className="text-sm font-medium text-ink">
      {label}
      <input
        value={text}
        placeholder={hint}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split(",").map((v) => v.trim()).filter(Boolean));
        }}
        className={inputClass}
      />
    </label>
  );
}

function Details({ draft, set }: { draft: OnboardingProfile; set: (patch: Partial<OnboardingProfile>) => void }) {
  const toggle = (slug: string) => {
    const on = draft.categories.includes(slug);
    if (!on && draft.categories.length >= 3) return;
    set({ categories: on ? draft.categories.filter((c) => c !== slug) : [...draft.categories, slug] });
  };
  return (
    <Panel title="Your details" hint="Your stage name, headline and bio appear on your public profile. Your legal name stays private.">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Full legal name
          <input value={draft.legalName} onChange={(e) => set({ legalName: e.target.value })} placeholder="As on your ID" autoComplete="name" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Stage name
          <input value={draft.stageName} onChange={(e) => set({ stageName: e.target.value })} placeholder="The name customers know you by" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink sm:col-span-2">
          Headline
          <input value={draft.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="e.g. Live Sufi singer with a seven-piece band" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink sm:col-span-2">
          Bio
          <textarea value={draft.bio} onChange={(e) => set({ bio: e.target.value })} rows={5} placeholder="Your experience, style and the events you're known for" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Base city
          <input value={draft.baseCity} onChange={(e) => set({ baseCity: e.target.value })} placeholder="e.g. Mumbai" className={inputClass} />
        </label>
        <ListInput label="Languages" hint="Hindi, English" values={draft.languages} onChange={(languages) => set({ languages })} />
        <ListInput label="Event types (optional)" hint="Weddings, Corporate" values={draft.eventTypes} onChange={(eventTypes) => set({ eventTypes })} />
        <ListInput label="Cities you travel to (optional)" hint="Delhi, Pune, Goa" values={draft.travelsTo} onChange={(travelsTo) => set({ travelsTo })} />
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-ink">Categories <span className="font-normal text-muted">(up to three)</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const on = draft.categories.includes(c.slug);
              return (
                <button key={c.slug} type="button" aria-pressed={on} onClick={() => toggle(c.slug)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-inset ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <label className="text-sm font-medium text-ink">
          Usual fee from, ₹ (optional)
          <input value={draft.feeFromRupees} inputMode="numeric" onChange={(e) => set({ feeFromRupees: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 200000" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Usual fee up to, ₹ (optional)
          <input value={draft.feeToRupees} inputMode="numeric" onChange={(e) => set({ feeToRupees: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 500000" className={inputClass} />
        </label>
      </div>
    </Panel>
  );
}

function PhotoPicker({ label, busy, onFile }: { label: string; busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn btn-outline btn-sm disabled:opacity-60">
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
        {busy ? "Uploading…" : label}
      </button>
    </>
  );
}

function Photos({ draft, onChange }: { draft: OnboardingProfile; onChange: (patch: Partial<OnboardingProfile>) => void }) {
  const [error, setError] = useState("");
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { blob, width, height } = await prepareArtistPhoto(file);
      return api.talent.onboarding.uploadPhoto(blob, width, height);
    },
  });
  const pick = (file: File, then: (url: string) => void) => {
    setError("");
    upload.mutate(file, { onSuccess: ({ url }) => then(url), onError: (err) => setError(errorMessage(err)) });
  };
  return (
    <Panel title="Photos" hint="A clear, recent photo of you. It must be at least 400 × 400 pixels. JPEG, PNG or WebP.">
      <div className="flex flex-wrap items-center gap-5">
        <span className="relative grid size-32 place-items-center overflow-hidden rounded-full bg-cream text-muted">
          {draft.photoUrl ? <Image src={draft.photoUrl} unoptimized={isUploaded(draft.photoUrl)} alt="Your profile photo" fill sizes="128px" className="object-cover" /> : <ImagePlus className="size-8" aria-hidden />}
        </span>
        <PhotoPicker label={draft.photoUrl ? "Change profile photo" : "Upload profile photo"} busy={upload.isPending} onFile={(file) => pick(file, (photoUrl) => onChange({ photoUrl }))} />
      </div>

      <h3 className="mt-8 font-display text-sm font-semibold text-ink">Gallery <span className="font-normal text-muted">(optional, up to {MAX_GALLERY_PHOTOS})</span></h3>
      <ul className="mt-3 flex flex-wrap gap-3">
        {draft.galleryUrls.map((url) => (
          <li key={url} className="relative size-24 overflow-hidden rounded-lg bg-cream">
            <Image src={url} unoptimized={isUploaded(url)} alt="" fill sizes="96px" className="object-cover" />
            <button type="button" aria-label="Remove this photo" onClick={() => onChange({ galleryUrls: draft.galleryUrls.filter((u) => u !== url) })} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-white/90 text-ink hover:bg-white">
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {draft.galleryUrls.length < MAX_GALLERY_PHOTOS && (
        <div className="mt-3">
          <PhotoPicker label="Add a gallery photo" busy={upload.isPending} onFile={(file) => pick(file, (url) => onChange({ galleryUrls: [...draft.galleryUrls, url] }))} />
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    </Panel>
  );
}

function Social({ draft, set }: { draft: OnboardingProfile; set: (patch: Partial<OnboardingProfile>) => void }) {
  return (
    <Panel title="Social media" hint="Add at least one, so our team can confirm it's really you. Paste the full link to your page.">
      <div className="grid gap-5 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((p) => (
          <label key={p.key} className="text-sm font-medium text-ink">
            {p.label}
            <input
              type="url"
              inputMode="url"
              value={draft.socialLinks[p.key] ?? ""}
              onChange={(e) => set({ socialLinks: { ...draft.socialLinks, [p.key]: e.target.value } })}
              placeholder={p.key === "website" ? "https://yoursite.com" : `https://${p.key === "x" ? "x" : p.key}.com/yourname`}
              className={inputClass}
            />
          </label>
        ))}
      </div>
    </Panel>
  );
}

function Documents({ state }: { state: OnboardingState }) {
  const client = useQueryClient();
  const [type, setType] = useState<IdDocumentType>("AADHAAR");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => client.invalidateQueries({ queryKey: keys.onboarding });
  const upload = useMutation({
    mutationFn: (file: File) => api.talent.onboarding.uploadDocument(type, file),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: api.talent.onboarding.deleteDocument,
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  });
  function pick(file: File) {
    setError("");
    if (!(ID_DOCUMENT_MIMES as readonly string[]).includes(file.type)) return setError("Upload a JPEG, PNG, WebP or PDF file");
    if (file.size > MAX_ID_DOCUMENT_BYTES) return setError("Files must be 5 MB or smaller");
    upload.mutate(file);
  }
  return (
    <Panel title="ID documents" hint="Upload at least one government ID that shows your full legal name.">
      <p className="flex gap-2 rounded-md bg-cream-soft p-3 text-sm text-ink-soft">
        <ShieldCheck className="size-5 shrink-0 text-gold-deep" aria-hidden />
        <span>Only our verification team can open these, and they're never shown on the website. For Aadhaar, please use a masked Aadhaar, which hides the first eight digits. You can download one from the UIDAI website.</span>
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1 text-sm font-medium text-ink">
          Document type
          <select value={type} onChange={(e) => setType(e.target.value as IdDocumentType)} className={inputClass}>
            {ID_DOCUMENT_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <input
          ref={input}
          type="file"
          accept={ID_DOCUMENT_MIMES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) pick(file);
          }}
        />
        <button type="button" disabled={upload.isPending} onClick={() => input.current?.click()} className="btn btn-dark disabled:opacity-60">
          {upload.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {upload.isPending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Photo or PDF, up to 5 MB.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {state.documents.length > 0 && (
        <ul className="mt-5 divide-y divide-line rounded-md border border-line">
          {state.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <ul className="min-w-0"><DocumentLink doc={d} /></ul>
              <button type="button" disabled={remove.isPending} aria-label={`Remove ${d.fileName}`} onClick={() => remove.mutate(d.id)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-cream hover:text-rose-700">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Review({ state, onFix }: { state: OnboardingState; onFix: (step: Step) => void }) {
  const client = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const submit = useMutation({
    mutationFn: api.talent.onboarding.submit,
    onSuccess: (next) => {
      client.setQueryData(keys.onboarding, next);
      void client.invalidateQueries({ queryKey: keys.session }); // their name replaces "New artist"
      window.scrollTo({ top: 0 });
    },
  });
  return (
    <div className="space-y-5">
      {state.missing.length > 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-5">
          <p className="font-display font-semibold text-amber-900">Still needed before you can send this</p>
          <ul className="mt-2 space-y-1">
            {state.missing.map((m) => (
              <li key={m.label}>
                <button type="button" onClick={() => onFix(m.step)} className="inline-flex items-center gap-1.5 text-sm text-amber-900 underline underline-offset-2">
                  <Plus className="size-3.5" aria-hidden />
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ProfileSummary profile={state.profile} documents={state.documents} />
      <div className="rounded-card border border-line bg-white p-5">
        <label className="flex gap-3 text-sm text-ink">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-gold-deep)]" />
          These details are true, and I agree to the team checking them and my ID documents to verify me.
        </label>
        {submit.error && <p role="alert" className="mt-3 text-sm text-rose-700">{errorMessage(submit.error)}</p>}
        <button type="button" disabled={!agreed || state.missing.length > 0 || submit.isPending} onClick={() => submit.mutate()} className="btn btn-gold mt-4 disabled:opacity-50">
          {submit.isPending ? "Sending…" : "Send for verification"}
          <ArrowRight aria-hidden />
        </button>
      </div>
    </div>
  );
}
