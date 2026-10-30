"use client";

import Image from "next/image";
import { useState } from "react";
import { BadgeCheck, Clock, ExternalLink, FileText, ShieldAlert } from "lucide-react";
import { SOCIAL_PLATFORMS, idDocumentLabel, type OnboardingDocument, type OnboardingProfile, type ReviewStatus } from "@repo/schemas";
import { api, errorMessage } from "@/lib/api/client";
import { openFile } from "@/lib/download";
import { isUploaded } from "@/lib/photo";

const BADGES: Record<ReviewStatus, { label: string; icon: typeof BadgeCheck; className: string }> = {
  APPROVED: { label: "Verified", icon: BadgeCheck, className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  SUBMITTED: { label: "Under review", icon: Clock, className: "bg-sky-50 text-sky-800 ring-sky-200" },
  REJECTED: { label: "Action needed", icon: ShieldAlert, className: "bg-rose-50 text-rose-800 ring-rose-200" },
  INCOMPLETE: { label: "Profile incomplete", icon: Clock, className: "bg-amber-50 text-amber-900 ring-amber-200" },
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const { label, icon: Icon, className } = BADGES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-semibold ring-1 ring-inset ${className}`}>
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm text-ink">{value}</dd>
    </div>
  );
}

/** What the artist entered. Used on the review step, while under review, and on My profile. */
export function ProfileSummary({ profile, documents }: { profile: OnboardingProfile; documents: OnboardingDocument[] }) {
  const socials = SOCIAL_PLATFORMS.flatMap((p) => (profile.socialLinks[p.key] ? [{ label: p.label, url: profile.socialLinks[p.key]! }] : []));
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-card border border-line bg-white p-6">
        <div className="flex items-center gap-4">
          {profile.photoUrl && (
            <span className="relative size-20 shrink-0 overflow-hidden rounded-full bg-cream">
              <Image src={profile.photoUrl} unoptimized={isUploaded(profile.photoUrl)} alt="" fill sizes="80px" className="object-cover" />
            </span>
          )}
          <div className="min-w-0">
            <p className="font-serif text-2xl font-semibold text-ink">{profile.stageName || "Your stage name"}</p>
            <p className="text-sm text-muted">{profile.headline}</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <Row label="Full legal name" value={profile.legalName} />
          <Row label="Base city" value={profile.baseCity} />
          <Row label="Languages" value={profile.languages.join(", ")} />
          <Row label="Travels to" value={profile.travelsTo.join(", ")} />
        </dl>
        {profile.bio && <dl className="mt-4"><Row label="Bio" value={profile.bio} /></dl>}
        {profile.galleryUrls.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {profile.galleryUrls.map((url) => (
              <li key={url} className="relative size-16 overflow-hidden rounded-lg bg-cream">
                <Image src={url} unoptimized={isUploaded(url)} alt="" fill sizes="64px" className="object-cover" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-5">
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-ink">Social media</h2>
          {socials.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None added.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {socials.map((s) => (
                <li key={s.label}>
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm text-gold-deep hover:underline">
                    {s.label}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-ink">ID documents</h2>
          {documents.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None uploaded.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {documents.map((d) => <DocumentLink key={d.id} doc={d} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function DocumentLink({ doc }: { doc: OnboardingDocument }) {
  const [error, setError] = useState("");
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          setError("");
          openFile(() => api.talent.onboarding.document(doc.id)).catch((err: unknown) => setError(errorMessage(err)));
        }}
        className="inline-flex items-center gap-2 text-left text-sm text-ink hover:text-gold-deep"
      >
        <FileText className="size-4 shrink-0 text-muted" aria-hidden />
        <span>
          {idDocumentLabel(doc.type)} <span className="text-muted">· View</span>
        </span>
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-rose-700">{error}</p>}
    </li>
  );
}
