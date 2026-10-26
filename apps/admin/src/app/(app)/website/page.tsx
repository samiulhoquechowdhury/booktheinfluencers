"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowRight, Eye, EyeOff, ExternalLink, ImagePlus, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { HeroSlideInputSchema, type HeroSlideInput, type HeroSlideRecord } from "@repo/schemas";
import { USING_API, api, errorMessage } from "@/lib/api";
import { prepareHeroImage } from "@/lib/image";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Failure, Loading, Modal, PageHeader, Pill, inputClass } from "@/components/ui";

// Website → home page hero. Super admins add, edit, reorder and hide carousel slides.

const RATIO = "1672 / 941";

export default function WebsitePage() {
  const { data: me } = useStaffSession();
  const isAdmin = Boolean(me?.roles.includes("SUPER_ADMIN"));
  const slides = useQuery({ queryKey: keys.hero, queryFn: api.site.hero, enabled: isAdmin });
  const [editing, setEditing] = useState<HeroSlideRecord | "new" | null>(null);
  const [preview, setPreview] = useState(0);
  const reorder = useStaffMutation(api.site.reorder, "Order saved");

  if (!me) return <Loading />;
  if (!isAdmin) return <Failure message="Only super admins edit the website" />;
  if (slides.isPending) return <Loading />;
  if (slides.error) return <Failure message={errorMessage(slides.error)} onRetry={() => slides.refetch()} />;

  const list = slides.data;
  const live = list.filter((s) => s.active && s.imageUrl);
  const shown = live[Math.min(preview, live.length - 1)];
  const move = (index: number, delta: number) => {
    const ids = list.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Website"
        description="The home page hero. Slides rotate every few seconds in this order; hidden slides stay here as drafts."
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
              <ExternalLink aria-hidden />
              View site
            </a>
            <button type="button" onClick={() => setEditing("new")} disabled={list.length >= 6} title={list.length >= 6 ? "Up to six slides" : undefined} className="btn btn-dark btn-sm disabled:opacity-50">
              <Plus aria-hidden />
              Add slide
            </button>
          </div>
        }
      />

      <p className="rounded-lg bg-cream px-4 py-3 text-sm text-ink-soft">
        {USING_API
          ? "Changes go live on the home page within about a minute."
          : "Demo mode: changes are saved in this browser and show on the home page in this browser only."}
      </p>

      {shown && (
        <section aria-label="Preview" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Preview</h2>
            {live.length > 1 && (
              <div className="flex gap-1.5">
                {live.map((s, i) => (
                  <button key={s.id} type="button" onClick={() => setPreview(i)} aria-label={`Preview slide ${i + 1}`} aria-current={s.id === shown.id} className={`h-1.5 rounded-full transition-all ${s.id === shown.id ? "w-6 bg-gold-deep" : "w-3 bg-line hover:bg-muted"}`} />
                ))}
              </div>
            )}
          </div>
          <HeroPreview slide={shown} />
        </section>
      )}

      <section aria-label="Slides" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Slides</h2>
        <ol className="space-y-3">
          {list.map((s, i) => (
            <SlideRow key={s.id} slide={s} index={i} count={list.length} onEdit={() => setEditing(s)} onMove={(d) => move(i, d)} moving={reorder.isPending} />
          ))}
        </ol>
      </section>

      {editing && <SlideEditor slide={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SlideRow({ slide: s, index, count, onEdit, onMove, moving }: { slide: HeroSlideRecord; index: number; count: number; onEdit: () => void; onMove: (delta: number) => void; moving: boolean }) {
  const { id: _id, position: _p, imageUrl: _u, updatedAt: _t, ...input } = s;
  const toggle = useStaffMutation(() => api.site.updateSlide(s.id, { ...input, active: !s.active }), s.active ? "Slide hidden" : "Slide shown");
  const remove = useStaffMutation(() => api.site.deleteSlide(s.id), "Slide removed");

  return (
    <li className={`flex flex-col gap-4 rounded-xl border border-line bg-white p-3 sm:flex-row sm:items-center ${s.active ? "" : "opacity-75"}`}>
      <div className="relative w-full shrink-0 overflow-hidden rounded-lg bg-ink sm:w-48" style={{ aspectRatio: RATIO }}>
        {s.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded or bundled photo
          <img src={s.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-xs text-white/60">No photo yet</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">#{index + 1}</span>
          {s.active ? <Pill tone="success">Showing</Pill> : <Pill tone="neutral">Hidden</Pill>}
          <span className="truncate text-xs text-muted">{s.eyebrow}</span>
        </div>
        <p className="mt-1 font-semibold text-ink">
          {s.title} <span className="italic text-gold-deep">{s.accent}</span>
        </p>
        <p className="line-clamp-2 text-sm text-muted">{s.body}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <IconButton label="Move up" disabled={index === 0 || moving} onClick={() => onMove(-1)} icon={ArrowUp} />
        <IconButton label="Move down" disabled={index === count - 1 || moving} onClick={() => onMove(1)} icon={ArrowDown} />
        <IconButton label={s.active ? "Hide slide" : "Show slide"} disabled={toggle.isPending || (!s.active && !s.imageUrl)} onClick={() => toggle.mutate(undefined)} icon={s.active ? EyeOff : Eye} />
        <IconButton label="Edit slide" onClick={onEdit} icon={Pencil} />
        <IconButton
          label="Delete slide"
          danger
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete “${s.title}”? This can't be undone.`)) remove.mutate(undefined);
          }}
          icon={Trash2}
        />
      </div>
    </li>
  );
}

function IconButton({ label, onClick, icon: Icon, disabled = false, danger = false }: { label: string; onClick: () => void; icon: typeof Eye; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`grid size-9 place-items-center rounded-md text-muted transition-colors disabled:opacity-30 ${danger ? "hover:bg-rose-50 hover:text-rose-700" : "hover:bg-cream hover:text-ink"}`}>
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/** A scaled-down copy of the home page hero layout. */
function HeroPreview({ slide }: { slide: Pick<HeroSlideRecord, "imageUrl" | "eyebrow" | "title" | "accent" | "body" | "ctaLabel" | "imageAlt" | "textPosition"> }) {
  const right = slide.textPosition === "right";
  return (
    <div className="relative isolate overflow-hidden rounded-xl bg-ink text-white" style={{ aspectRatio: RATIO }}>
      {slide.imageUrl && (
        <div className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded photo */}
          <img src={slide.imageUrl} alt={slide.imageAlt} className="size-full object-cover object-center" />
          <div aria-hidden className="absolute inset-0 bg-ink/45" />
          <div aria-hidden className={`absolute inset-0 ${right ? "bg-gradient-to-l" : "bg-gradient-to-r"} from-ink/55 via-ink/15 to-transparent`} />
        </div>
      )}
      <div className={`flex h-full max-w-[45%] flex-col justify-center gap-2 p-5 sm:p-8 ${right ? "ml-auto" : ""}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-warm sm:text-xs">{slide.eyebrow || "Eyebrow"}</p>
        <p className="font-serif text-lg font-semibold leading-tight sm:text-3xl">
          {slide.title || "Headline"}
          <span className="block italic text-warm">{slide.accent}</span>
        </p>
        <p className="line-clamp-3 text-[11px] text-white/75 sm:text-sm">{slide.body}</p>
        <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-warm px-3 py-1.5 text-[11px] font-semibold text-ink sm:text-xs">
          {slide.ctaLabel || "Button"}
          <ArrowRight className="size-3" aria-hidden />
        </span>
      </div>
    </div>
  );
}

const LINKS = [
  { label: "Talent section on the home page", href: "#talent" },
  { label: "Join as talent section", href: "#for-talent" },
  { label: "Send a brief", href: "/enquiry" },
  { label: "Creators", href: "/categories/creators" },
  { label: "Singers", href: "/categories/singers" },
  { label: "DJs", href: "/categories/djs" },
  { label: "Comedians", href: "/categories/comedians" },
  { label: "How it works", href: "/how-it-works" },
];

function SlideEditor({ slide, onClose }: { slide?: HeroSlideRecord; onClose: () => void }) {
  const [form, setForm] = useState<HeroSlideInput>(() => ({
    eyebrow: slide?.eyebrow ?? "",
    title: slide?.title ?? "",
    accent: slide?.accent ?? "",
    body: slide?.body ?? "",
    ctaLabel: slide?.ctaLabel ?? "Explore talent",
    ctaHref: slide?.ctaHref ?? "#talent",
    imageAlt: slide?.imageAlt ?? "",
    imageId: slide?.imageId ?? null,
    active: slide?.active ?? true,
    textPosition: slide?.textPosition ?? "left",
  }));
  const [imageUrl, setImageUrl] = useState(slide?.imageUrl ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof HeroSlideInput>(key: K, value: HeroSlideInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const save = useStaffMutation((input: HeroSlideInput) => (slide ? api.site.updateSlide(slide.id, input) : api.site.createSlide(input)), slide ? "Slide saved" : "Slide added");

  async function choose(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    setErrors((e) => ({ ...e, image: "" }));
    try {
      const image = await prepareHeroImage(f);
      const uploaded = await api.site.upload(image.blob, image.width, image.height);
      set("imageId", uploaded.id);
      setImageUrl(image.preview);
    } catch (error) {
      setErrors((e) => ({ ...e, image: errorMessage(error) }));
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  function submit() {
    const result = HeroSlideInputSchema.safeParse(form);
    const found: Record<string, string> = {};
    if (!result.success) for (const issue of result.error.issues.toReversed()) found[String(issue.path[0])] = issue.message;
    if (form.active && !imageUrl) found.image = "Add a photo, or untick “Show on the home page” to save it as a draft";
    setErrors(found);
    if (!result.success || found.image) return;
    save.mutate(result.data, { onSuccess: onClose });
  }

  const field = (key: keyof HeroSlideInput, label: string, props: { max: number; placeholder?: string; hint?: string; multiline?: boolean }) => (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-xs font-semibold text-ink-soft">
        <span>
          {label}
          {props.hint && <span className="ml-1 font-normal text-muted">· {props.hint}</span>}
        </span>
        <span className="font-normal text-muted">{String(form[key] ?? "").length}/{props.max}</span>
      </span>
      {props.multiline ? (
        <textarea rows={3} maxLength={props.max} value={String(form[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} placeholder={props.placeholder} className={inputClass} />
      ) : (
        <input maxLength={props.max} value={String(form[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} placeholder={props.placeholder} className={inputClass} />
      )}
      {errors[key] && <span className="block text-xs text-rose-700">{errors[key]}</span>}
    </label>
  );

  return (
    <Modal title={slide ? "Edit slide" : "New slide"} onClose={onClose} wide>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <HeroPreview slide={{ ...form, imageUrl }} />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="hero-photo" onChange={(e) => void choose(e.target.files?.[0])} />
            <label htmlFor="hero-photo" className={`btn btn-outline btn-sm ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <LoaderCircle className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
              {uploading ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
            </label>
            <span className="text-xs text-muted">Landscape, ideally 1672 × 941 or larger (16:9). JPEG, PNG or WebP. The left third sits behind the text.</span>
          </div>
          {errors.image && <p className="text-xs text-rose-700">{errors.image}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {field("eyebrow", "Small label above", { max: 60, placeholder: "Managed talent booking · India" })}
          {field("imageAlt", "Photo description", { max: 200, placeholder: "What's in the photo", hint: "for screen readers" })}
          {field("title", "Headline", { max: 60, placeholder: "Book the talent." })}
          {field("accent", "Headline, second line", { max: 60, placeholder: "We handle the rest.", hint: "shown in gold italics" })}
        </div>
        {field("body", "Text", { max: 320, multiline: true, placeholder: "One or two sentences about what you offer." })}

        <div className="grid gap-4 sm:grid-cols-2">
          {field("ctaLabel", "Button text", { max: 30, placeholder: "Explore talent" })}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink-soft">Button goes to</span>
            <select
              value={LINKS.some((l) => l.href === form.ctaHref) ? form.ctaHref : "custom"}
              onChange={(e) => set("ctaHref", e.target.value === "custom" ? "/" : e.target.value)}
              className={inputClass}
            >
              {LINKS.map((l) => <option key={l.href} value={l.href}>{l.label}</option>)}
              <option value="custom">Another page…</option>
            </select>
            {!LINKS.some((l) => l.href === form.ctaHref) && <input value={form.ctaHref} onChange={(e) => set("ctaHref", e.target.value)} placeholder="/about or https://…" aria-label="Button link" className={inputClass} />}
            {errors.ctaHref && <span className="block text-xs text-rose-700">{errors.ctaHref}</span>}
          </label>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold text-ink-soft">Text sits on the</legend>
          <div className="mt-1.5 inline-flex rounded-lg bg-cream p-1">
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={form.textPosition === side}
                onClick={() => set("textPosition", side)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${form.textPosition === side ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {side === "left" ? "Left" : "Right"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Pick the emptier side of the photo so faces stay clear. On phones the text always fills the width.</p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="size-4 accent-[var(--color-gold-deep)]" />
          Show on the home page
        </label>

        <div className="flex gap-2 border-t border-line pt-4">
          <button type="submit" disabled={save.isPending || uploading} className="btn btn-dark disabled:opacity-50">{save.isPending ? "Saving…" : slide ? "Save slide" : "Add slide"}</button>
          <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
