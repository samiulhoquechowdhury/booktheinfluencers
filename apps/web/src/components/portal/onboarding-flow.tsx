"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock, CloudCheck, ImagePlus, LoaderCircle, Plus, ShieldCheck, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import {
  ID_DOCUMENT_MIMES,
  ID_DOCUMENT_TYPES,
  MAX_GALLERY_PHOTOS,
  MAX_ID_DOCUMENT_BYTES,
  OnboardingProfileSchema,
  SOCIAL_PLATFORMS,
  idDocumentLabel,
  onboardingMissing,
  type IdDocumentType,
  type OnboardingProfile,
  type OnboardingState,
} from "@repo/schemas";
import { CATEGORIES, CITIES, EVENT_TYPES, LANGUAGES } from "@repo/mock/catalogue/data";
import { formatINRCompact } from "@repo/utils";
import { api, errorMessage } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import { prepareArtistPhoto } from "@/lib/image";
import { isUploaded } from "@/lib/photo";
import { DocumentLink, ProfileSummary } from "./profile-summary";

// Shown in place of the portal until an artist is approved: their profile, photos, social links and ID, then review.
// Progress saves by itself, so an artist can leave and come back.

const STEPS = [
  { key: "details", label: "Your details", hint: "Name, bio and what you do" },
  { key: "photos", label: "Photos", hint: "How customers see you" },
  { key: "social", label: "Social media", hint: "So we can confirm it's you" },
  { key: "documents", label: "ID documents", hint: "Private, for verification" },
  { key: "review", label: "Review", hint: "Check and send" },
] as const;
type Step = (typeof STEPS)[number]["key"];
type Errors = Record<string, string>;

const inputClass = "w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-gold aria-[invalid=true]:border-rose-400";
const SAVE_AFTER_MS = 1200;

/** Field problems for one step: format errors, plus what's still needed before it's complete. */
function problemsIn(draft: OnboardingProfile, documentCount: number, step: Step) {
  const found: Errors = {};
  const parsed = OnboardingProfileSchema.safeParse(draft);
  if (!parsed.success) for (const issue of parsed.error.issues) found[issue.path.join(".")] ??= issue.message;
  for (const m of onboardingMissing(draft, documentCount)) {
    if (m.step === step) found[m.field] ??= `Add ${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}`;
  }
  return found;
}

/** "@riya", "instagram.com/riya" and "http://…" all become a full https link. */
function toLink(platform: string, value: string) {
  const text = value.trim();
  if (!text) return "";
  const handle = /^@?([\w.-]+)$/.exec(text)?.[1];
  const bases: Record<string, string> = { instagram: "https://instagram.com/", x: "https://x.com/", facebook: "https://facebook.com/", youtube: "https://youtube.com/@" };
  if (handle && !handle.includes(".") && bases[platform]) return bases[platform] + handle;
  if (/^https:\/\//i.test(text)) return text;
  return `https://${text.replace(/^http:\/\//i, "")}`;
}

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
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState("");
  const saved = useRef(JSON.stringify(state.profile));
  const heading = useRef<HTMLDivElement>(null);
  const index = STEPS.findIndex((s) => s.key === step);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: api.talent.onboarding.save,
    onSuccess: (next) => {
      client.setQueryData(keys.onboarding, next);
      setFailure("");
    },
    onError: (error) => setFailure(errorMessage(error)),
  });

  useEffect(() => {
    const json = JSON.stringify(draft);
    if (json === saved.current) return;
    const timer = setTimeout(() => {
      const parsed = OnboardingProfileSchema.safeParse(draft);
      if (!parsed.success) return; // the field shows its own message; nothing's lost
      saved.current = json;
      save(parsed.data);
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [draft, save]);

  const set = (patch: Partial<OnboardingProfile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // Only the field that changed loses its message. "socialLinks.instagram" is one link, not the whole group.
    const changed = (field: string) => {
      const [top, link] = field.split(".");
      if (!(top! in patch)) return false;
      return link ? patch.socialLinks?.[link] !== draft.socialLinks[link] : true;
    };
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([field]) => !changed(field))));
  };

  /** Saves now rather than waiting, then runs `then`. */
  function saveNow(then: () => void) {
    const parsed = OnboardingProfileSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(problemsIn(draft, state.documents.length, step));
      return;
    }
    saved.current = JSON.stringify(draft);
    save(parsed.data, { onSuccess: then });
  }

  function moveTo(next: Step) {
    setErrors({});
    setStep(next);
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }

  function showFirstProblem() {
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-problem]');
      first?.scrollIntoView({ block: "center", behavior: "smooth" });
      first?.focus({ preventScroll: true });
    });
  }

  function next() {
    const problems = problemsIn(draft, state.documents.length, step);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return showFirstProblem();
    saveNow(() => moveTo(STEPS[index + 1]!.key));
  }

  const done = STEPS.filter((s) => s.key !== "review" && !state.missing.some((m) => m.step === s.key)).length;
  const percent = Math.round((done / (STEPS.length - 1)) * 100);

  return (
    <div data-hide-footer className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
          <span>{percent === 100 ? "Ready to send" : `${percent}% complete`}</span>
          <span className="lg:hidden">Step {index + 1} of {STEPS.length}</span>
        </div>
        <div role="progressbar" aria-label="Profile progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream">
          <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <ol className="mt-4 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {STEPS.map((s, i) => {
            const current = s.key === step;
            const complete = s.key !== "review" && !state.missing.some((m) => m.step === s.key);
            return (
              <li key={s.key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => saveNow(() => moveTo(s.key))}
                  aria-current={current ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors lg:py-2.5 ${current ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-xs font-semibold ${complete ? "bg-emerald-600 text-white" : current ? "bg-ink text-white" : "bg-cream text-muted"}`}>
                    {complete ? <Check className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block whitespace-nowrap font-display text-sm font-semibold ${current ? "text-ink" : "text-ink-soft"}`}>{s.label}</span>
                    <span className="hidden text-xs text-muted lg:block">{s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <div className="min-w-0">
        {state.status === "REJECTED" && (
          <div role="alert" className="mb-5 flex gap-3 rounded-card border border-rose-200 bg-rose-50 p-5 text-rose-900">
            <TriangleAlert className="size-6 shrink-0" aria-hidden />
            <div>
              <p className="font-display font-semibold">Please fix this and send it again</p>
              <p className="mt-1 whitespace-pre-line text-sm">{state.reviewNote}</p>
            </div>
          </div>
        )}

        <div ref={heading} tabIndex={-1} className="outline-none">
          {step === "details" && <Details draft={draft} set={set} errors={errors} />}
          {step === "photos" && <Photos draft={draft} set={set} errors={errors} />}
          {step === "social" && <Social draft={draft} set={set} errors={errors} />}
          {step === "documents" && <Documents state={state} errors={errors} />}
          {step === "review" && <Review state={state} onFix={(s) => saveNow(() => moveTo(s))} />}
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-line bg-cream-soft/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-t-lg sm:px-0">
          <button type="button" disabled={index === 0} onClick={() => saveNow(() => moveTo(STEPS[index - 1]!.key))} className="btn btn-outline btn-sm disabled:invisible">
            <ArrowLeft aria-hidden />
            Back
          </button>
          <p role="status" className={`flex items-center gap-1.5 text-xs ${failure ? "text-rose-700" : "text-muted"}`}>
            {failure ? failure : saving ? <><LoaderCircle className="size-3.5 animate-spin" aria-hidden />Saving…</> : <><CloudCheck className="size-3.5" aria-hidden /><span className="sm:hidden">Saved</span><span className="hidden sm:inline">Your progress is saved</span></>}
          </p>
          {step !== "review" && (
            <button type="button" onClick={next} className="btn btn-gold btn-sm">
              Continue
              <ArrowRight aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-5 sm:p-8">
      <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

type Control = { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined };

function Field({ label, optional, hint, error, count, className = "", children }: { label: string; optional?: boolean; hint?: string; error?: string; count?: string; className?: string; children: (control: Control) => ReactNode }) {
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
      {error ? <p id={note} className="mt-1.5 text-xs text-rose-700">{error}</p> : hint ? <p id={note} className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Tap to pick from the list, or add your own. */
function ChipPicker({ label, optional, options, values, onChange, max, error, hint, allowOther = true }: { label: string; optional?: boolean; options: { value: string; label: string }[]; values: string[]; onChange: (values: string[]) => void; max: number; error?: string; hint?: string; allowOther?: boolean }) {
  const [other, setOther] = useState("");
  const full = values.length >= max;
  const extras = values.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }));
  const add = () => {
    const value = other.trim();
    if (value && !full && !values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setOther("");
  };
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-ink">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2" data-problem={error ? true : undefined} tabIndex={error ? -1 : undefined}>
        {[...options, ...extras].map((o) => {
          const on = values.includes(o.value);
          return (
            <button key={o.value} type="button" aria-pressed={on} disabled={!on && full} onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition-colors disabled:opacity-40 ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}>
              {on && <Check className="size-3.5" aria-hidden />}
              {o.label}
            </button>
          );
        })}
        {allowOther && !full && (
          <span className="inline-flex items-center rounded-full bg-white ring-1 ring-inset ring-line focus-within:ring-gold">
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Other"
              aria-label={`Add another: ${label}`}
              className="w-20 bg-transparent py-1.5 pl-3 text-sm text-ink outline-none placeholder:text-muted"
            />
            <button type="button" onClick={add} aria-label="Add" className="grid size-8 place-items-center text-muted hover:text-ink">
              <Plus className="size-4" aria-hidden />
            </button>
          </span>
        )}
      </div>
      {error ? <p className="mt-1.5 text-xs text-rose-700">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </fieldset>
  );
}

type StepProps = { draft: OnboardingProfile; set: (patch: Partial<OnboardingProfile>) => void; errors: Errors };

function Details({ draft, set, errors }: StepProps) {
  const fee = (value: string) => (value ? formatINRCompact(BigInt(value) * 100n) : "");
  const list = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
  return (
    <Panel title="Your details" hint="Your stage name, headline and bio appear on your public profile. Your legal name stays private.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full legal name" hint="Exactly as it appears on your ID." error={errors.legalName}>
          {(c) => <input {...c} value={draft.legalName} onChange={(e) => set({ legalName: e.target.value })} autoComplete="name" maxLength={100} className={inputClass} />}
        </Field>
        <Field label="Stage name" hint="The name customers know you by." error={errors.stageName}>
          {(c) => <input {...c} value={draft.stageName} onChange={(e) => set({ stageName: e.target.value })} maxLength={80} className={inputClass} />}
        </Field>
        <Field label="Headline" className="sm:col-span-2" count={`${draft.headline.length} / 120`} error={errors.headline}>
          {(c) => <input {...c} value={draft.headline} onChange={(e) => set({ headline: e.target.value })} maxLength={120} placeholder="e.g. Live Sufi singer with a seven-piece band" className={inputClass} />}
        </Field>
        <Field label="Bio" className="sm:col-span-2" count={`${draft.bio.length} / 3000`} hint="A couple of sentences about your experience, style and the events you're known for." error={errors.bio}>
          {(c) => <textarea {...c} value={draft.bio} onChange={(e) => set({ bio: e.target.value })} rows={5} maxLength={3000} className={inputClass} />}
        </Field>
        <Field label="Base city" error={errors.baseCity}>
          {(c) => (
            <>
              <input {...c} value={draft.baseCity} onChange={(e) => set({ baseCity: e.target.value })} list="onboarding-cities" autoComplete="off" maxLength={60} placeholder="Start typing your city" className={inputClass} />
              <datalist id="onboarding-cities">
                {CITIES.map((city) => <option key={city.slug} value={city.name} />)}
              </datalist>
            </>
          )}
        </Field>
        <div className="sm:col-span-2">
          <ChipPicker label="Categories" allowOther={false} max={3} hint="Pick up to three." options={CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))} values={draft.categories} onChange={(categories) => set({ categories })} error={errors.categories} />
        </div>
        <div className="sm:col-span-2">
          <ChipPicker label="Languages you perform in" max={10} options={list(LANGUAGES)} values={draft.languages} onChange={(languages) => set({ languages })} error={errors.languages} />
        </div>
        <div className="sm:col-span-2">
          <ChipPicker label="Event types" optional max={12} options={list(EVENT_TYPES)} values={draft.eventTypes} onChange={(eventTypes) => set({ eventTypes })} />
        </div>
        <div className="sm:col-span-2">
          <ChipPicker label="Cities you travel to" optional max={10} options={list(CITIES.map((c) => c.name))} values={draft.travelsTo} onChange={(travelsTo) => set({ travelsTo })} />
        </div>
        <Field label="Usual fee from" optional hint={fee(draft.feeFromRupees) || undefined} error={errors.feeFromRupees}>
          {(c) => <Rupees control={c} value={draft.feeFromRupees} onChange={(feeFromRupees) => set({ feeFromRupees })} placeholder="200000" />}
        </Field>
        <Field label="Usual fee up to" optional hint={fee(draft.feeToRupees) || undefined} error={errors.feeToRupees}>
          {(c) => <Rupees control={c} value={draft.feeToRupees} onChange={(feeToRupees) => set({ feeToRupees })} placeholder="500000" />}
        </Field>
      </div>
    </Panel>
  );
}

function Rupees({ control, value, onChange, placeholder }: { control: Control; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">₹</span>
      <input {...control} value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder={placeholder} className={`${inputClass} pl-8`} />
    </div>
  );
}

/** Drag a file here, or click to choose one. */
function DropZone({ label, hint, accept, busy, onFile, className = "" }: { label: string; hint: string; accept: string; busy: boolean; onFile: (file: File) => void; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={`flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors disabled:opacity-60 ${over ? "border-gold bg-cream" : "border-line bg-cream-soft hover:border-gold"}`}
      >
        {busy ? <LoaderCircle className="size-6 animate-spin text-gold-deep" aria-hidden /> : <Upload className="size-6 text-gold-deep" aria-hidden />}
        <span className="font-display text-sm font-semibold text-ink">{busy ? "Uploading…" : label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </button>
    </div>
  );
}

const PHOTO_TYPES = "image/jpeg,image/png,image/webp";

function Photos({ draft, set, errors }: StepProps) {
  const [failure, setFailure] = useState("");
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { blob, width, height } = await prepareArtistPhoto(file);
      return api.talent.onboarding.uploadPhoto(blob, width, height);
    },
  });
  const pick = (file: File, then: (url: string) => void) => {
    setFailure("");
    upload.mutate(file, { onSuccess: ({ url }) => then(url), onError: (err) => setFailure(errorMessage(err)) });
  };
  return (
    <Panel title="Photos" hint="A clear, recent photo of you helps customers choose. Your first photo is the one they see in search.">
      <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
        <span className="relative mx-auto grid size-36 place-items-center overflow-hidden rounded-full bg-cream text-muted">
          {draft.photoUrl ? <Image src={draft.photoUrl} unoptimized={isUploaded(draft.photoUrl)} alt="Your profile photo" fill sizes="144px" className="object-cover" /> : <ImagePlus className="size-8" aria-hidden />}
        </span>
        <div>
          <DropZone label={draft.photoUrl ? "Change profile photo" : "Upload profile photo"} hint="Drag it here or click. JPEG, PNG or WebP, at least 400 × 400 pixels." accept={PHOTO_TYPES} busy={upload.isPending} onFile={(file) => pick(file, (photoUrl) => set({ photoUrl }))} />
          {errors.photoUrl && <p data-problem tabIndex={-1} className="mt-2 text-xs text-rose-700">{errors.photoUrl}</p>}
        </div>
      </div>

      <h3 className="mt-8 font-display text-sm font-semibold text-ink">
        Gallery <span className="font-normal text-muted">(optional, up to {MAX_GALLERY_PHOTOS})</span>
      </h3>
      <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {draft.galleryUrls.map((url) => (
          <li key={url} className="relative aspect-square overflow-hidden rounded-lg bg-cream">
            <Image src={url} unoptimized={isUploaded(url)} alt="" fill sizes="120px" className="object-cover" />
            <button type="button" aria-label="Remove this photo" onClick={() => set({ galleryUrls: draft.galleryUrls.filter((u) => u !== url) })} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-white/90 text-ink hover:bg-white">
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {draft.galleryUrls.length < MAX_GALLERY_PHOTOS && (
        <DropZone className="mt-3" label="Add a gallery photo" hint="Performance shots work best." accept={PHOTO_TYPES} busy={upload.isPending} onFile={(file) => pick(file, (url) => set({ galleryUrls: [...draft.galleryUrls, url] }))} />
      )}
      {failure && <p role="alert" className="mt-3 text-sm text-rose-700">{failure}</p>}
    </Panel>
  );
}

function Social({ draft, set, errors }: StepProps) {
  const update = (key: string, value: string) => set({ socialLinks: { ...draft.socialLinks, [key]: value } });
  return (
    <Panel title="Social media" hint="Add at least one, so our team can confirm it's really you. Paste a link or type your username.">
      {errors.socialLinks && <p data-problem tabIndex={-1} className="mb-4 text-sm text-rose-700">{errors.socialLinks}</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((p) => (
          <Field key={p.key} label={p.label} error={errors[`socialLinks.${p.key}`]}>
            {(c) => (
              <input
                {...c}
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                value={draft.socialLinks[p.key] ?? ""}
                onChange={(e) => update(p.key, e.target.value)}
                onBlur={(e) => {
                  const link = toLink(p.key, e.target.value);
                  if (link !== e.target.value) update(p.key, link);
                }}
                placeholder={p.key === "website" ? "yoursite.com" : p.key === "spotify" ? "open.spotify.com/artist/…" : "@yourname"}
                className={inputClass}
              />
            )}
          </Field>
        ))}
      </div>
    </Panel>
  );
}

function Documents({ state, errors }: { state: OnboardingState; errors: Errors }) {
  const client = useQueryClient();
  const [type, setType] = useState<IdDocumentType>("AADHAAR");
  const [failure, setFailure] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: keys.onboarding });
  const upload = useMutation({
    mutationFn: (file: File) => api.talent.onboarding.uploadDocument(type, file),
    onSuccess: refresh,
    onError: (err) => setFailure(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: api.talent.onboarding.deleteDocument,
    onSuccess: refresh,
    onError: (err) => setFailure(errorMessage(err)),
  });
  function pick(file: File) {
    setFailure("");
    if (!(ID_DOCUMENT_MIMES as readonly string[]).includes(file.type)) return setFailure("Upload a JPEG, PNG, WebP or PDF file");
    if (file.size > MAX_ID_DOCUMENT_BYTES) return setFailure("Files must be 5 MB or smaller");
    upload.mutate(file);
  }
  return (
    <Panel title="ID documents" hint="Upload at least one government ID that shows your full legal name.">
      <p className="flex gap-2 rounded-md bg-cream-soft p-3 text-sm text-ink-soft">
        <ShieldCheck className="size-5 shrink-0 text-gold-deep" aria-hidden />
        <span>Encrypted, and only our verification team can open them. They're never shown on the website. For Aadhaar, please use a masked Aadhaar, which hides the first eight digits. You can download one from the UIDAI website.</span>
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-ink">Which document?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ID_DOCUMENT_TYPES.map((d) => (
            <button key={d.key} type="button" aria-pressed={type === d.key} onClick={() => setType(d.key)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition-colors ${type === d.key ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}>
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>

      <DropZone className="mt-4" label={`Upload ${idDocumentLabel(type)}`} hint="Drag it here or click. A photo or PDF, up to 5 MB." accept={ID_DOCUMENT_MIMES.join(",")} busy={upload.isPending} onFile={pick} />
      {errors.documents && <p data-problem tabIndex={-1} className="mt-2 text-xs text-rose-700">{errors.documents}</p>}
      {failure && <p role="alert" className="mt-3 text-sm text-rose-700">{failure}</p>}

      {state.documents.length > 0 && (
        <ul className="mt-5 divide-y divide-line rounded-md border border-line">
          {state.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <ul><DocumentLink doc={d} /></ul>
                <p className="mt-0.5 truncate pl-6 text-xs text-muted">{d.fileName}</p>
              </div>
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
        <label className="flex cursor-pointer gap-3 text-sm text-ink">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-gold-deep)]" />
          These details are true, and I agree to the team checking them and my ID documents to verify me.
        </label>
        {submit.error && <p role="alert" className="mt-3 text-sm text-rose-700">{errorMessage(submit.error)}</p>}
        <button type="button" disabled={!agreed || state.missing.length > 0 || submit.isPending} onClick={() => submit.mutate()} className="btn btn-gold mt-4 disabled:opacity-50">
          {submit.isPending ? "Sending…" : "Send for verification"}
          <ArrowRight aria-hidden />
        </button>
        {state.missing.length === 0 && !agreed && <p className="mt-2 text-xs text-muted">Tick the box above to send.</p>}
      </div>
    </div>
  );
}
