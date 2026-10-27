"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Plus, Upload } from "lucide-react";
import type { ProfileStatus } from "@repo/schemas";
import { api, can, errorMessage } from "@/lib/api";
import { PROFILE_STATUS_LABELS, inr, inrCompact, percent, profileTone } from "@/lib/format";
import { keys, useStaffSession } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

export default function TalentsPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.talents, queryFn: api.talents.list });
  const { data: staff } = useStaffSession();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProfileStatus | "ALL">("ALL");
  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;
  const rows = data.filter((t) => (status === "ALL" || t.status === status) && `${t.stageName} ${t.headline} ${t.baseCity}`.toLowerCase().includes(q.toLowerCase()));
  const count = (s: ProfileStatus) => data.filter((t) => t.status === s).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Talents"
        description="Roster with internal rate cards. Public fee bands are shown to customers; rate cards never are."
        actions={
          staff && can(staff, "TALENT_MANAGER") && (
            <div className="flex flex-wrap gap-2">
              <Link href="/talents/import" className="btn btn-outline btn-sm">
                <Upload aria-hidden />
                Import CSV
              </Link>
              <Link href="/talents/new" className="btn btn-dark btn-sm">
                <Plus aria-hidden />
                New talent
              </Link>
            </div>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, style or city" aria-label="Search talents" className={`${inputClass} max-w-sm`} />
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {(["ALL", "PUBLISHED", "DRAFT", "HIDDEN"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${status === s ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}
            >
              {s === "ALL" ? `All · ${data.length}` : `${PROFILE_STATUS_LABELS[s]} · ${count(s)}`}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>{["Artist", "Status", "Base", "Representation", "Public band", "Standard rate", "Minimum", "Payout share", "Open bookings"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.slug} className="border-b border-line last:border-0 hover:bg-cream-soft">
                <td className="px-4 py-3">
                  <Link href={`/talents/${t.slug}`} className="flex items-center gap-1.5 font-semibold text-ink hover:text-gold-deep">
                    {t.stageName}
                    {t.verified ? <BadgeCheck className="size-4 text-gold-deep" aria-label="Verified rep" /> : <Pill tone="action">KYC pending</Pill>}
                  </Link>
                  <span className="text-xs text-muted">{t.headline} · {t.tier === "PREMIUM" ? "Premium" : "Standard"}</span>
                </td>
                <td className="px-4 py-3"><Pill tone={profileTone(t.status)}>{PROFILE_STATUS_LABELS[t.status]}</Pill></td>
                <td className="px-4 py-3">{t.baseCity}</td>
                <td className="px-4 py-3">{t.repName}</td>
                <td className="whitespace-nowrap px-4 py-3">{t.feeBandMinPaise && t.feeBandMaxPaise ? `${inrCompact(t.feeBandMinPaise)} – ${inrCompact(t.feeBandMaxPaise)}` : "On request"}</td>
                <td className="whitespace-nowrap px-4 py-3">{t.rateCard ? inr(t.rateCard.sellingRatePaise) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{t.rateCard ? inr(t.rateCard.minimumRatePaise) : "—"}</td>
                <td className="px-4 py-3">{t.rateCard ? percent(t.rateCard.payoutBps) : "—"}</td>
                <td className="px-4 py-3">{t.openBookings}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">No talents match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
