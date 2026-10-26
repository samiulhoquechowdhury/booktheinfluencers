"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { inr, inrCompact, percent } from "@/lib/format";
import { keys } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

export default function TalentsPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.talents, queryFn: api.talents.list });
  const [q, setQ] = useState("");
  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;
  const rows = data.filter((t) => `${t.stageName} ${t.headline} ${t.baseCity}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <PageHeader title="Talents" description="Roster with internal rate cards. Public fee bands are shown to customers; rate cards never are." />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, style or city" aria-label="Search talents" className={`${inputClass} max-w-sm`} />
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>{["Artist", "Base", "Representation", "Public band", "Standard rate", "Minimum", "Payout share", "Open bookings"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
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
                <td className="px-4 py-3">{t.baseCity}</td>
                <td className="px-4 py-3">{t.repName}</td>
                <td className="whitespace-nowrap px-4 py-3">{t.feeBandMinPaise && t.feeBandMaxPaise ? `${inrCompact(t.feeBandMinPaise)} – ${inrCompact(t.feeBandMaxPaise)}` : "On request"}</td>
                <td className="whitespace-nowrap px-4 py-3">{t.rateCard ? inr(t.rateCard.sellingRatePaise) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{t.rateCard ? inr(t.rateCard.minimumRatePaise) : "—"}</td>
                <td className="px-4 py-3">{t.rateCard ? percent(t.rateCard.payoutBps) : "—"}</td>
                <td className="px-4 py-3">{t.openBookings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
