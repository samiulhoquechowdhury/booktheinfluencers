"use client";

/* eslint-disable @next/next/no-img-element -- artists' uploads, already resized; served by the API. */

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { REVIEW_LABELS, reviewTone } from "@/lib/format";
import { keys } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill } from "@/components/ui";

export default function VerificationsPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.verifications, queryFn: api.verifications.list });
  const [all, setAll] = useState(false);
  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;
  const waiting = data.filter((r) => r.status === "SUBMITTED");
  const rows = all ? data : waiting;

  return (
    <div className="space-y-5">
      <PageHeader title="Verifications" description="Artists who signed up themselves. Check their details and ID. They appear on the website only after you approve them." />
      <div className="flex gap-1.5">
        {[
          { on: false, label: `Waiting (${waiting.length})` },
          { on: true, label: `All (${data.length})` },
        ].map((tab) => (
          <button key={tab.label} type="button" aria-pressed={all === tab.on} onClick={() => setAll(tab.on)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${all === tab.on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">{all ? "No artists have signed up yet." : "Nobody's waiting for review."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.slug}>
              <Link href={`/verifications/${r.slug}`} className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 hover:border-gold">
                {r.photoUrl ? <img src={r.photoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover ring-1 ring-line" /> : <span className="size-12 shrink-0 rounded-full bg-cream" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{r.stageName || "Unnamed artist"}</span>
                  <span className="block truncate text-xs text-muted">
                    {[r.legalName, r.baseCity, `${r.documentCount} ID ${r.documentCount === 1 ? "document" : "documents"}`].filter(Boolean).join(" · ")}
                  </span>
                  {r.submittedAt && <span className="block text-xs text-muted">Sent {formatDateTime(r.submittedAt)}</span>}
                </span>
                <Pill tone={reviewTone(r.status)}>{REVIEW_LABELS[r.status]}</Pill>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
