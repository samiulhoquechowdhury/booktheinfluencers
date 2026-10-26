"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Pencil, Plus, X } from "lucide-react";
import { RateCardSchema, RepSchema, type ProfileStatus, type TalentAdminDetail } from "@repo/schemas";
import { CATEGORIES } from "@repo/mock/catalogue/data";
import { USING_API, api, can, errorMessage, type StaffUser } from "@/lib/api";
import { PROFILE_STATUS_LABELS, inr, inrCompact, percent, profileTone, toPaise, toRupees, verificationTone } from "@/lib/format";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Card, Failure, Loading, Pill, inputClass } from "@/components/ui";
import { TalentForm } from "@/components/talent/talent-form";
import { CalendarCard } from "@/components/talent/calendar-card";

const REPRESENTATION: Record<TalentAdminDetail["representationType"], string> = {
  AGENCY_MANAGED: "Agency managed",
  TALENT_MANAGED: "Self managed",
  PLATFORM_COORDINATED: "Platform coordinated",
};

export default function TalentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: staff } = useStaffSession();
  const talent = useQuery({ queryKey: keys.talent(slug), queryFn: () => api.talents.get(slug) });

  if (talent.isPending || !staff) return <Loading />;
  if (talent.error) return <Failure message={errorMessage(talent.error)} onRetry={() => talent.refetch()} />;
  const t = talent.data;

  return (
    <div className="space-y-5">
      <Link href="/talents" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Talents
      </Link>
      <Header talent={t} staff={staff} />
      {!USING_API && (
        <p className="rounded-lg bg-cream px-4 py-3 text-sm text-ink-soft">
          Demo mode: changes here are saved in this browser for the CRM only. The public site shows them once the API is connected.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard talent={t} staff={staff} />
        <div className="space-y-5">
          <RateCardPanel talent={t} staff={staff} />
          <RepsPanel talent={t} staff={staff} />
          <CalendarCard slug={t.slug} manage={can(staff, "TALENT_MANAGER")} />
        </div>
      </div>
    </div>
  );
}

function Header({ talent: t, staff }: { talent: TalentAdminDetail; staff: StaffUser }) {
  const setStatus = useStaffMutation((status: ProfileStatus) => api.talents.setStatus(t.slug, status), "Status updated");
  const manage = can(staff, "TALENT_MANAGER");
  const blocked = t.publishBlockers.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- staff-entered photo from any host */}
          <img src={t.photoUrl} alt="" className="size-16 rounded-xl object-cover ring-1 ring-line" />
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-ink">
              {t.stageName}
              <Pill tone={profileTone(t.status)}>{PROFILE_STATUS_LABELS[t.status]}</Pill>
            </h1>
            <p className="text-sm text-muted">{t.headline} · {t.baseCity} · {t.languages.join(", ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.status === "PUBLISHED" && (
            <a href={`/talent/${t.slug}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
              <ExternalLink aria-hidden />
              Public profile
            </a>
          )}
          {manage && t.status !== "PUBLISHED" && (
            <button type="button" disabled={blocked || setStatus.isPending} title={blocked ? t.publishBlockers.join(". ") : undefined} onClick={() => setStatus.mutate("PUBLISHED")} className="btn btn-dark btn-sm disabled:opacity-50">
              Publish
            </button>
          )}
          {manage && t.status === "PUBLISHED" && (
            <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate("HIDDEN")} className="btn btn-outline btn-sm">
              Hide from site
            </button>
          )}
          {manage && t.status !== "DRAFT" && (
            <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate("DRAFT")} className="btn btn-outline btn-sm">
              Back to draft
            </button>
          )}
        </div>
      </div>
      {t.status !== "PUBLISHED" && blocked && (
        <div role="status" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Before this profile can go live</p>
            <ul className="mt-1 list-disc pl-5">
              {t.publishBlockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileCard({ talent: t, staff }: { talent: TalentAdminDetail; staff: StaffUser }) {
  const [editing, setEditing] = useState(false);
  const update = useStaffMutation((input: Parameters<typeof api.talents.update>[1]) => api.talents.update(t.slug, input), "Profile saved");
  const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;

  if (editing)
    return (
      <Card title="Edit profile" className="lg:col-span-2">
        <TalentForm initial={t} submitLabel="Save profile" pending={update.isPending} onSubmit={(input) => update.mutate(input, { onSuccess: () => setEditing(false) })} onCancel={() => setEditing(false)} />
      </Card>
    );

  return (
    <Card
      title="Profile"
      actions={
        can(staff, "TALENT_MANAGER") && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-outline btn-sm">
            <Pencil aria-hidden />
            Edit
          </button>
        )
      }
    >
      <p className="whitespace-pre-line text-sm text-ink-soft">{t.bio}</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <Item label="Categories" value={t.categories.map(categoryName).join(", ")} />
        <Item label="Tier" value={`${t.tier === "PREMIUM" ? "Premium" : "Standard"}${t.featured ? " · featured" : ""}`} />
        <Item label="Representation" value={REPRESENTATION[t.representationType]} />
        <Item label="Public fee band" value={t.feeBandMinPaise && t.feeBandMaxPaise ? `${inrCompact(t.feeBandMinPaise)} – ${inrCompact(t.feeBandMaxPaise)}` : "On request"} />
        <Item label="Event types" value={t.eventTypes.join(", ") || "—"} />
        <Item label="Travels to" value={t.travelsTo.join(", ") || "—"} />
        <Item label="Tags" value={t.tags.join(", ") || "—"} />
        <Item label="Bookings" value={String(t.bookingCount)} />
      </dl>
      {t.galleryUrls.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {t.galleryUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element -- staff-entered gallery from any host
            <img key={url} src={url} alt="" className="size-16 rounded-lg object-cover ring-1 ring-line" />
          ))}
        </div>
      )}
    </Card>
  );
}

function RateCardPanel({ talent: t, staff }: { talent: TalentAdminDetail; staff: StaffUser }) {
  const canEdit = can(staff, "TALENT_MANAGER", "ACCOUNTS");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ selling: "", minimum: "", payout: "" });
  const [error, setError] = useState("");
  const save = useStaffMutation((card: Parameters<typeof api.talents.setRateCard>[1]) => api.talents.setRateCard(t.slug, card), "Rate card saved");

  function start() {
    setForm({ selling: toRupees(t.rateCard?.sellingRatePaise), minimum: toRupees(t.rateCard?.minimumRatePaise), payout: t.rateCard ? String(t.rateCard.payoutBps / 100) : "80" });
    setError("");
    setEditing(true);
  }

  return (
    <Card
      title="Rate card (internal)"
      actions={
        canEdit && !editing && (
          <button type="button" onClick={start} className="btn btn-outline btn-sm">
            <Pencil aria-hidden />
            {t.rateCard ? "Edit" : "Add"}
          </button>
        )
      }
    >
      {editing ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const result = RateCardSchema.safeParse({ sellingRatePaise: toPaise(form.selling), minimumRatePaise: toPaise(form.minimum), payoutBps: Math.round(Number(form.payout) * 100) });
            if (!result.success) return setError(result.error.issues[0]!.message);
            if (result.data.sellingRatePaise === "0") return setError("Enter the standard rate");
            save.mutate(result.data, { onSuccess: () => setEditing(false) });
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1 text-xs font-semibold text-ink-soft">
              Standard rate (₹)
              <input inputMode="numeric" value={form.selling} onChange={(e) => setForm({ ...form, selling: e.target.value.replace(/\D/g, "") })} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-ink-soft">
              Minimum (₹)
              <input inputMode="numeric" value={form.minimum} onChange={(e) => setForm({ ...form, minimum: e.target.value.replace(/\D/g, "") })} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-ink-soft">
              Payout share (%)
              <input inputMode="decimal" value={form.payout} onChange={(e) => setForm({ ...form, payout: e.target.value.replace(/[^\d.]/g, "") })} className={inputClass} />
            </label>
          </div>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <p className="text-xs text-muted">Quotes with an artist fee below the minimum need super admin approval.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="btn btn-dark btn-sm disabled:opacity-50">{save.isPending ? "Saving…" : "Save rate card"}</button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-outline btn-sm">Cancel</button>
          </div>
        </form>
      ) : t.rateCard ? (
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <Item label="Standard selling rate" value={inr(t.rateCard.sellingRatePaise)} strong />
          <Item label="Minimum" value={inr(t.rateCard.minimumRatePaise)} strong />
          <Item label="Payout share" value={percent(t.rateCard.payoutBps)} strong />
        </dl>
      ) : (
        <p className="text-sm text-muted">{can(staff, "SALES", "TALENT_MANAGER", "ACCOUNTS") ? "No rate card yet. Quotes can't be drafted until one is added." : "Rate cards are visible to sales, talent managers and accounts."}</p>
      )}
    </Card>
  );
}

function RepsPanel({ talent: t, staff }: { talent: TalentAdminDetail; staff: StaffUser }) {
  const manage = can(staff, "TALENT_MANAGER");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", agencyName: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const add = useStaffMutation((rep: Parameters<typeof api.talents.addRep>[1]) => api.talents.addRep(t.slug, rep), "Representative added");
  const verify = useStaffMutation(({ id, v }: { id: string; v: "VERIFIED" | "REJECTED" | "PENDING" }) => api.talents.setRepVerification(id, v), "Verification updated");

  return (
    <Card
      title="Representatives"
      actions={
        manage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-outline btn-sm">
            <Plus aria-hidden />
            Add
          </button>
        )
      }
    >
      {t.reps.length === 0 && !adding && <p className="text-sm text-muted">No representative linked yet. A verified one is needed to publish.</p>}
      <ul className="divide-y divide-line">
        {t.reps.map((rep) => (
          <li key={rep.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
            <div className="text-sm">
              <p className="flex items-center gap-2 font-semibold text-ink">
                {rep.name}
                <Pill tone={verificationTone(rep.verification)}>{rep.verification === "VERIFIED" ? "Verified" : rep.verification === "REJECTED" ? "Rejected" : "KYC pending"}</Pill>
              </p>
              <p className="text-xs text-muted">{[rep.agencyName, `+91 ${rep.phone}`, rep.email].filter(Boolean).join(" · ")}</p>
            </div>
            {manage && (
              <div className="flex gap-2">
                {rep.verification !== "VERIFIED" && (
                  <button type="button" disabled={verify.isPending} onClick={() => verify.mutate({ id: rep.id, v: "VERIFIED" })} className="btn btn-outline btn-sm">
                    <Check aria-hidden />
                    Verify
                  </button>
                )}
                {rep.verification !== "REJECTED" && (
                  <button
                    type="button"
                    disabled={verify.isPending}
                    onClick={() => {
                      const last = t.status === "PUBLISHED" && rep.verification === "VERIFIED" && t.reps.filter((r) => r.verification === "VERIFIED").length === 1;
                      if (!last || window.confirm("This is the only verified representative. Rejecting them takes the profile off the public site. Continue?")) verify.mutate({ id: rep.id, v: "REJECTED" });
                    }}
                    className="btn btn-outline btn-sm"
                  >
                    <X aria-hidden />
                    Reject
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <form
          noValidate
          className="mt-3 space-y-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const result = RepSchema.safeParse({ ...form, phone: form.phone.replace(/\D/g, "").slice(-10) });
            if (!result.success) return setError(result.error.issues[0]!.message);
            add.mutate(result.data, {
              onSuccess: () => {
                setAdding(false);
                setForm({ name: "", agencyName: "", phone: "", email: "" });
                setError("");
              },
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" aria-label="Representative name" className={inputClass} />
            <input value={form.agencyName} onChange={(e) => setForm({ ...form, agencyName: e.target.value })} placeholder="Agency (optional)" aria-label="Agency" className={inputClass} />
            <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Mobile number" aria-label="Mobile number" className={inputClass} />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (optional)" aria-label="Email" className={inputClass} />
          </div>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={add.isPending} className="btn btn-dark btn-sm disabled:opacity-50">{add.isPending ? "Adding…" : "Add representative"}</button>
            <button type="button" onClick={() => setAdding(false)} className="btn btn-outline btn-sm">Cancel</button>
          </div>
          <p className="text-xs text-muted">New representatives start as KYC pending. Verify them once their documents are checked.</p>
        </form>
      )}
    </Card>
  );
}

function Item({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}
