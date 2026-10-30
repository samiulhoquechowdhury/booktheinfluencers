"use client";

/* eslint-disable @next/next/no-img-element -- artists' uploads, already resized; served by the API. */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, ExternalLink, FileText, ShieldX } from "lucide-react";
import { ReviewRejectSchema, SOCIAL_PLATFORMS, idDocumentLabel, type VerificationDetail } from "@repo/schemas";
import { formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { openFile } from "@/lib/download";
import { REVIEW_LABELS, inr, reviewTone } from "@/lib/format";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Card, Failure, Loading, Modal, Pill, inputClass } from "@/components/ui";

export default function VerificationDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useQuery({ queryKey: keys.verification(slug), queryFn: () => api.verifications.get(slug) });
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  if (detail.isPending) return <Loading />;
  if (detail.error) return <Failure message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />;
  const a = detail.data;

  return (
    <div className="space-y-5">
      <Link href="/verifications" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        All verifications
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        {a.photoUrl ? <img src={a.photoUrl} alt="" className="size-20 rounded-full object-cover ring-1 ring-line" /> : <span className="size-20 rounded-full bg-cream" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{a.stageName}</h1>
            <Pill tone={reviewTone(a.status)}>{REVIEW_LABELS[a.status]}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted">{a.headline}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === "SUBMITTED" && (
            <button type="button" onClick={() => setDialog("approve")} className="btn btn-dark btn-sm">
              <BadgeCheck aria-hidden />
              Approve
            </button>
          )}
          {(a.status === "SUBMITTED" || a.status === "APPROVED") && (
            <button type="button" onClick={() => setDialog("reject")} className="btn btn-outline btn-sm">
              <ShieldX aria-hidden />
              {a.status === "APPROVED" ? "Withdraw verification" : "Send back"}
            </button>
          )}
        </div>
      </div>

      {a.status === "REJECTED" && a.reviewNote && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          Sent back{a.reviewedByName ? ` by ${a.reviewedByName}` : ""}: {a.reviewNote}
        </p>
      )}
      {a.status === "APPROVED" && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Verified{a.reviewedByName ? ` by ${a.reviewedByName}` : ""}{a.reviewedAt ? ` on ${formatDateTime(a.reviewedAt)}` : ""}.{" "}
          <Link href={`/talents/${a.slug}`} className="font-medium underline underline-offset-2">Add their rate card</Link> before quoting them.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card title="Details">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Full legal name" value={a.legalName} />
              <Field label="Mobile" value={a.phone} />
              <Field label="Email" value={a.email} />
              <Field label="Base city" value={a.baseCity} />
              <Field label="Categories" value={a.categories.join(", ")} />
              <Field label="Languages" value={a.languages.join(", ")} />
              <Field label="Event types" value={a.eventTypes.join(", ")} />
              <Field label="Travels to" value={a.travelsTo.join(", ")} />
              <Field label="Fee range" value={a.feeBandMinPaise && a.feeBandMaxPaise ? `${inr(a.feeBandMinPaise)} – ${inr(a.feeBandMaxPaise)}` : null} />
              <Field label="Sent for review" value={a.submittedAt ? formatDateTime(a.submittedAt) : null} />
            </dl>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Bio</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{a.bio}</p>
          </Card>
          {a.galleryUrls.length > 0 && (
            <Card title="Gallery">
              <div className="flex flex-wrap gap-2">
                {a.galleryUrls.map((url) => <img key={url} src={url} alt="" className="size-28 rounded-lg object-cover ring-1 ring-line" />)}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="ID documents">
            <Documents artist={a} />
            <p className="mt-3 text-xs text-muted">Check the name matches their legal name, and the photo matches their profile. Each view is recorded in the audit log.</p>
          </Card>
          <Card title="Social media">
            <ul className="space-y-1.5">
              {SOCIAL_PLATFORMS.flatMap((p) => {
                const url = a.socialLinks[p.key];
                return url
                  ? [
                      <li key={p.key}>
                        <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm text-gold-deep hover:underline">
                          {p.label}
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      </li>,
                    ]
                  : [];
              })}
            </ul>
          </Card>
        </div>
      </div>

      {dialog === "approve" && <ApproveDialog artist={a} onClose={() => setDialog(null)} />}
      {dialog === "reject" && <RejectDialog artist={a} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

function Documents({ artist }: { artist: VerificationDetail }) {
  const [error, setError] = useState("");
  if (artist.documents.length === 0) return <p className="text-sm text-muted">None uploaded.</p>;
  return (
    <>
      <ul className="space-y-2">
        {artist.documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
            <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
              <FileText className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block">{idDocumentLabel(d.type)}</span>
                <span className="block truncate text-xs text-muted">{d.fileName}</span>
              </span>
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setError("");
                openFile(() => api.verifications.document(d.id)).catch((err: unknown) => setError(errorMessage(err)));
              }}
            >
              View
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    </>
  );
}

function ApproveDialog({ artist, onClose }: { artist: VerificationDetail; onClose: () => void }) {
  const approve = useStaffMutation(() => api.verifications.approve(artist.slug), `${artist.stageName} is verified`);
  return (
    <Modal title={`Approve ${artist.stageName}?`} onClose={onClose}>
      <p className="text-sm text-ink-soft">Their profile goes live on the website with a verified badge, and they get a text to say so. Only approve once you've checked their ID.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
        <button type="button" disabled={approve.isPending} onClick={() => approve.mutate(undefined, { onSuccess: onClose })} className="btn btn-dark btn-sm disabled:opacity-50">
          {approve.isPending ? "Approving…" : "Approve and publish"}
        </button>
      </div>
    </Modal>
  );
}

function RejectDialog({ artist, onClose }: { artist: VerificationDetail; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reject = useStaffMutation((why: string) => api.verifications.reject(artist.slug, why), "Sent back to the artist");
  return (
    <Modal title={artist.status === "APPROVED" ? "Withdraw verification" : "Send back to the artist"} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = ReviewRejectSchema.safeParse({ reason });
          if (!parsed.success) return setError(parsed.error.issues[0]!.message);
          setError("");
          reject.mutate(parsed.data.reason, {
            onSuccess: () => {
              onClose();
              router.push("/verifications");
            },
            onError: (err) => setError(errorMessage(err)),
          });
        }}
      >
        <label className="block text-sm font-medium text-ink">
          What needs fixing?
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} autoFocus placeholder="e.g. The name on your ID doesn't match your legal name." className={`${inputClass} mt-1.5`} />
        </label>
        <p className="mt-1.5 text-xs text-muted">The artist sees this in their portal and by text.{artist.status === "APPROVED" ? " Their profile is hidden from the website." : ""}</p>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
          <button type="submit" disabled={reject.isPending} className="btn btn-dark btn-sm disabled:opacity-50">{reject.isPending ? "Sending…" : "Send back"}</button>
        </div>
      </form>
    </Modal>
  );
}
