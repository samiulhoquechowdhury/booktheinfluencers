"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Lock, X } from "lucide-react";
import { formatDate, toIstDateKey } from "@repo/utils";
import { api, can, errorMessage } from "@/lib/api";
import { inr, inrCompact, istDate, percent } from "@/lib/format";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Card, Failure, Loading, inputClass } from "@/components/ui";

export default function TalentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: staff } = useStaffSession();
  const talents = useQuery({ queryKey: keys.talents, queryFn: api.talents.list });
  const blackouts = useQuery({ queryKey: keys.blackouts(slug), queryFn: () => api.talents.blackouts(slug) });
  const [date, setDate] = useState("");
  const toggle = useStaffMutation(({ d, on }: { d: string; on: boolean }) => api.talents.setBlackout(slug, d, on), "Calendar updated");

  if (talents.isPending || blackouts.isPending || !staff) return <Loading />;
  if (talents.error || blackouts.error) return <Failure message={errorMessage(talents.error ?? blackouts.error)} />;
  const talent = talents.data.find((t) => t.slug === slug);
  if (!talent) return <Failure message="Talent not found" />;
  const manage = can(staff, "TALENT_MANAGER");

  return (
    <div className="space-y-5">
      <Link href="/talents" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Talents
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{talent.stageName}</h1>
          <p className="text-sm text-muted">{talent.headline} · {talent.baseCity} · {talent.languages.join(", ")}</p>
        </div>
        <a href={`/talent/${talent.slug}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
          <ExternalLink aria-hidden />
          Public profile
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Rate card (internal)">
          {talent.rateCard ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-xs text-muted">Standard selling rate</dt><dd className="font-semibold">{inr(talent.rateCard.sellingRatePaise)}</dd></div>
              <div><dt className="text-xs text-muted">Minimum (needs approval below)</dt><dd className="font-semibold">{inr(talent.rateCard.minimumRatePaise)}</dd></div>
              <div><dt className="text-xs text-muted">Payout share</dt><dd className="font-semibold">{percent(talent.rateCard.payoutBps)}</dd></div>
              <div><dt className="text-xs text-muted">Public fee band</dt><dd className="font-semibold">{talent.feeBandMinPaise && talent.feeBandMaxPaise ? `${inrCompact(talent.feeBandMinPaise)} – ${inrCompact(talent.feeBandMaxPaise)}` : "On request"}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-muted">Rate cards are visible to sales, talent managers and accounts.</p>
          )}
          <p className="mt-4 text-sm text-muted">Representation: <span className="text-ink">{talent.repName}</span>{talent.verified ? " · verified" : " · KYC pending"}</p>
        </Card>

        <Card title="Blackout dates">
          {manage && (
            <form
              className="mb-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                toggle.mutate({ d: date, on: true }, { onSuccess: () => setDate("") });
              }}
            >
              <input type="date" min={toIstDateKey(new Date())} value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date to block" className={inputClass} />
              <button type="submit" disabled={!date || toggle.isPending} className="btn btn-dark btn-sm disabled:opacity-50">Block date</button>
            </form>
          )}
          {blackouts.data.all.length === 0 ? (
            <p className="text-sm text-muted">No blocked dates.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {blackouts.data.all.map((d) => {
                const seeded = blackouts.data.seeded.includes(d);
                return (
                  <li key={d} className="flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-sm text-ink">
                    {formatDate(istDate(d))}
                    {seeded ? (
                      <Lock className="size-3 text-muted" aria-label="Set at onboarding" />
                    ) : (
                      manage && (
                        <button type="button" onClick={() => toggle.mutate({ d, on: false })} aria-label={`Unblock ${d}`} className="text-muted hover:text-rose-700">
                          <X className="size-3.5" aria-hidden />
                        </button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Blocked dates hide the artist from date searches. The artist can also block dates from their portal.</p>
        </Card>
      </div>
    </div>
  );
}
