"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { inr } from "@/lib/format";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Card, Pill } from "./ui";

// Payments → Reconciliation (Accounts): the nightly cross-check of instalments, payments, webhooks and payouts.

export function ReconciliationCard() {
  const overview = useQuery({ queryKey: keys.reconciliation, queryFn: api.reconciliation.overview });
  const run = useStaffMutation(api.reconciliation.run);
  const [showAll, setShowAll] = useState(false);
  const latest = overview.data?.latest;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-gold-deep" aria-hidden />
          Payment check
        </span>
      }
      actions={
        <button type="button" onClick={() => run.mutate(undefined)} disabled={run.isPending} className="btn btn-outline btn-sm disabled:opacity-60">
          {run.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          {run.isPending ? "Checking…" : "Run now"}
        </button>
      }
    >
      {overview.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : overview.error ? (
        <p className="text-sm text-rose-700">{errorMessage(overview.error)}</p>
      ) : !latest ? (
        <p className="text-sm text-muted">No checks yet. It runs every night at 2:30 am, or run it now.</p>
      ) : (
        <>
          <div className={`flex flex-wrap items-start gap-3 rounded-lg p-3 ${latest.ok ? "bg-emerald-50" : "bg-rose-50"}`}>
            {latest.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className={`font-semibold ${latest.ok ? "text-emerald-900" : "text-rose-900"}`}>
                {latest.ok ? "Everything matches" : `${latest.errorCount} ${latest.errorCount === 1 ? "issue" : "issues"} to look at`}
                {latest.warnCount > 0 && <span className="font-normal"> · {latest.warnCount} {latest.warnCount === 1 ? "warning" : "warnings"}</span>}
              </p>
              <p className="text-xs text-ink-soft">
                {formatDateTime(latest.ranAt)} · {latest.trigger === "schedule" ? "nightly run" : `run by ${latest.trigger}`} · {latest.totals.checkedMilestones} instalments, {latest.totals.checkedPayouts} payouts checked · {inr(latest.totals.capturedPaise)} received in total
              </p>
            </div>
          </div>

          {latest.findings.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {(showAll ? latest.findings : latest.findings.slice(0, 6)).map((f, i) => (
                <li key={`${f.code}-${i}`} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                  <span className="flex min-w-0 flex-1 gap-2">
                    <Pill tone={f.severity === "error" ? "danger" : "action"}>{f.severity === "error" ? "Issue" : "Warning"}</Pill>
                    <span className="min-w-0 text-ink-soft">{f.message}</span>
                  </span>
                  {f.leadId && (
                    <Link href={`/leads/${f.leadId}`} className="shrink-0 text-xs font-semibold text-gold-deep hover:underline">
                      {f.ref}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {latest.findings.length > 6 && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 text-xs font-medium text-muted hover:text-ink">
              {showAll ? "Show fewer" : `Show all ${latest.findings.length}`}
            </button>
          )}

          {overview.data.history.length > 1 && (
            <details className="mt-3 border-t border-line pt-3 text-xs">
              <summary className="font-medium text-muted">Recent checks</summary>
              <ul className="mt-2 space-y-1">
                {overview.data.history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 text-ink-soft">
                    <span>{formatDateTime(h.ranAt)} · {h.trigger === "schedule" ? "nightly" : h.trigger}</span>
                    <Pill tone={h.ok ? "success" : "danger"}>{h.ok ? "OK" : `${h.errorCount} issues`}</Pill>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] text-muted">Compares instalments with money received, confirmed bookings with their advance, completed events with payouts, and flags gateway notifications that weren't processed. Accounts and the super admin get an email when the nightly check finds issues.</p>
    </Card>
  );
}
