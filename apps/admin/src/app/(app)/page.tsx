"use client";

import Link from "next/link";
import { AlarmClock, ArrowRight, BellRing } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { PIPELINE_COLUMNS, STAGE_LABELS, inr, inrCompact, percent } from "@/lib/format";
import { keys, useStaffSession } from "@/lib/hooks";
import { Card, Failure, Loading, PageHeader, Pill } from "@/components/ui";
import { dueLabel, followUpState } from "@/components/lead/follow-ups";

export default function OverviewPage() {
  const { data: staff } = useStaffSession();
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.analytics, queryFn: api.analytics });
  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;

  const maxStage = Math.max(1, ...PIPELINE_COLUMNS.map((s) => data.byStage[s] ?? 0));
  const attention = [
    data.pendingApprovals > 0 && { href: "/enquiries", text: `${data.pendingApprovals} quote${data.pendingApprovals > 1 ? "s" : ""} waiting for approval` },
    (data.byStage.NEW ?? 0) > 0 && { href: "/enquiries", text: `${data.byStage.NEW} new lead${(data.byStage.NEW ?? 0) > 1 ? "s" : ""} to contact` },
    data.newApplications > 0 && { href: "/inbox", text: `${data.newApplications} new artist application${data.newApplications > 1 ? "s" : ""}` },
    data.newContactRequests > 0 && { href: "/inbox", text: `${data.newContactRequests} contact request${data.newContactRequests > 1 ? "s" : ""}` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <div className="space-y-6">
      <PageHeader title={`Good to see you, ${staff?.name.split(" ")[0] ?? ""}`} description="Everything on the books right now." />

      {attention.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><BellRing className="size-4 text-amber-700" aria-hidden />Needs attention</span>}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {attention.map((item) => (
              <li key={item.text}>
                <Link href={item.href} className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950 hover:bg-amber-100">
                  {item.text}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open leads" value={String(data.openLeads)} hint={`${data.leadCount} total`} />
        <Stat label="Confirmed bookings" value={String(data.confirmedBookings)} />
        <Stat label="GMV (confirmed)" value={inrCompact(data.gmvPaise)} hint={`Avg ${inr(data.avgBookingPaise)}`} />
        <Stat label="Time to confirm" value={data.avgDaysToConfirm === null ? "—" : `${data.avgDaysToConfirm} days`} hint="Enquiry → confirmed" />
        <Stat label="Enquiry → quote" value={percent(data.enquiryToQuoteBps)} />
        <Stat label="Quote → confirmed" value={percent(data.quoteToConfirmedBps)} />
        {data.finance && (
          <>
            <Stat label="Margin (confirmed)" value={inrCompact(data.finance.marginPaise)} finance />
            <Stat label="Receivables" value={inrCompact(data.finance.receivablesPaise)} hint={`Payouts due ${inrCompact(data.finance.pendingPayoutsPaise)}`} finance />
          </>
        )}
      </dl>

      <MyFollowUps />

      <Card title="Leads by stage" actions={<Link href="/pipeline" className="text-sm font-medium text-gold-deep hover:underline">Open pipeline</Link>}>
        <ul className="space-y-2">
          {PIPELINE_COLUMNS.map((stage) => {
            const count = data.byStage[stage] ?? 0;
            return (
              <li key={stage}>
                <Link href="/enquiries" className="grid grid-cols-[160px_1fr_32px] items-center gap-3 rounded-md px-1 py-1 text-sm hover:bg-cream-soft">
                  <span className="truncate text-ink-soft">{STAGE_LABELS[stage]}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-cream">
                    <span className="block h-full rounded-full bg-gold" style={{ width: `${(count / maxStage) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold text-ink">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Also: {data.byStage.CLOSED ?? 0} closed · {data.byStage.LOST ?? 0} lost · {data.byStage.CANCELLED ?? 0} cancelled
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, finance = false }: { label: string; value: string; hint?: string; finance?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${finance ? "border-emerald-200" : "border-line"}`}>
      <dt className="text-xs font-medium text-muted">
        {label}
        {finance && <span className="ml-1 text-emerald-700">· finance</span>}
      </dt>
      <dd className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** The signed-in person's open follow-ups: overdue first, then today, then the next few. */
function MyFollowUps() {
  const { data, isPending } = useQuery({ queryKey: keys.myFollowUps, queryFn: api.followUps.mine, refetchInterval: 60_000 });
  if (isPending || !data) return null;
  const overdue = data.filter((f) => followUpState(f.dueAt) === "overdue").length;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <AlarmClock className="size-4 text-gold-deep" aria-hidden />
          My follow-ups
          {overdue > 0 && <Pill tone="danger">{overdue} overdue</Pill>}
        </span>
      }
    >
      {data.length === 0 ? (
        <p className="text-sm text-muted">You're all caught up. Follow-ups you set on leads show here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.slice(0, 8).map((f) => {
            const state = followUpState(f.dueAt);
            return (
              <li key={f.id}>
                <Link href={`/leads/${f.leadId}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-cream-soft">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{f.title}</span>
                    <span className="text-xs text-muted">{f.leadRef} · {f.contactName}</span>
                  </span>
                  <Pill tone={state === "overdue" ? "danger" : state === "today" ? "action" : "info"}>{state === "overdue" ? `Overdue · ${dueLabel(f.dueAt)}` : dueLabel(f.dueAt)}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {data.length > 8 && <p className="mt-2 text-xs text-muted">And {data.length - 8} more on your leads.</p>}
    </Card>
  );
}
