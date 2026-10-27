"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarDays, Columns3, Rows3, Search, X } from "lucide-react";
import { followUpState } from "@/components/lead/follow-ups";
import { formatDate, type LeadStage } from "@repo/utils";
import { CATEGORIES } from "@repo/mock/catalogue/data";
import { api, errorMessage, type LeadRow } from "@/lib/api";
import { AVAILABILITY_LABELS, PIPELINE_COLUMNS, STAGE_LABELS, availabilityTone, inrCompact, istDate, stageTone } from "@/lib/format";
import { keys } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

const TERMINAL: LeadStage[] = ["CLOSED", "LOST", "CANCELLED"];

export default function PipelinePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Pipeline />
    </Suspense>
  );
}

function Pipeline() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "table" ? "table" : "board";
  const filters = {
    q: params.get("q") ?? "",
    owner: params.get("owner") ?? "",
    stage: params.get("stage") ?? "",
    city: params.get("city") ?? "",
    category: params.get("category") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.leads, queryFn: api.leads.list });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = filters.q.toLowerCase();
    return data.filter(
      (lead) =>
        (!q || `${lead.ref} ${lead.contactName} ${lead.customerPhone} ${lead.bookings.map((b) => b.name).join(" ")}`.toLowerCase().includes(q)) &&
        (!filters.owner || (filters.owner === "unassigned" ? !lead.ownerName : lead.ownerName === filters.owner)) &&
        (!filters.stage || lead.stage === filters.stage) &&
        (!filters.city || lead.city === filters.city) &&
        (!filters.category || lead.categories.includes(filters.category)) &&
        (!filters.from || lead.eventDate >= filters.from) &&
        (!filters.to || lead.eventDate <= filters.to),
    );
  }, [data, filters.q, filters.owner, filters.stage, filters.city, filters.category, filters.from, filters.to]);

  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;

  const owners = [...new Set(data.map((l) => l.ownerName).filter((o): o is string => Boolean(o)))].sort();
  const cities = [...new Set(data.map((l) => l.city))].sort();
  const active = Object.values(filters).some(Boolean);
  const columns = filters.stage ? [filters.stage as LeadStage] : PIPELINE_COLUMNS;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pipeline"
        description={`${rows.length} of ${data.length} leads`}
        actions={
          <div role="group" aria-label="View" className="flex rounded-md border border-line bg-white p-0.5">
            {(["board", "table"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => set({ view: option === "board" ? "" : "table" })}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${view === option ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {option === "board" ? <Columns3 className="size-4" aria-hidden /> : <Rows3 className="size-4" aria-hidden />}
                {option === "board" ? "Board" : "Table"}
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-2 rounded-xl border border-line bg-white p-3">
        {/* Row 1: search and the four pickers. min-w-0 lets every control shrink inside its cell. */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-12">
          <div className="relative sm:col-span-2 lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search ref, name, phone, artist" aria-label="Search" className={`${inputClass} min-w-0 pl-9`} />
          </div>
          <select value={filters.owner} onChange={(e) => set({ owner: e.target.value })} aria-label="Owner" className={`${inputClass} min-w-0 lg:col-span-2`}>
            <option value="">Any owner</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={filters.stage} onChange={(e) => set({ stage: e.target.value })} aria-label="Stage" className={`${inputClass} min-w-0 lg:col-span-2`}>
            <option value="">Any stage</option>
            {[...PIPELINE_COLUMNS, ...TERMINAL].map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <select value={filters.city} onChange={(e) => set({ city: e.target.value })} aria-label="City" className={`${inputClass} min-w-0 lg:col-span-2`}>
            <option value="">Any city</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category" className={`${inputClass} min-w-0 lg:col-span-2`}>
            <option value="">Any category</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>

        {/* Row 2: event date range, then clear. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted sm:w-auto">
            <CalendarDays className="size-4" aria-hidden />
            Event date
          </span>
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:w-auto">
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} aria-label="Event from" className={`${inputClass} min-w-0 sm:w-44`} />
            <span className="text-sm text-muted">to</span>
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="Event to" className={`${inputClass} min-w-0 sm:w-44`} />
          </div>
          {active && (
            <button type="button" onClick={() => router.replace(view === "table" ? `${pathname}?view=table` : pathname)} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-cream hover:text-ink">
              <X className="size-4" aria-hidden />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
          <div className="flex gap-3">
            {columns.map((stage) => {
              const items = rows.filter((l) => l.stage === stage);
              return (
                <section key={stage} aria-label={STAGE_LABELS[stage]} className="w-64 shrink-0 rounded-xl bg-cream/70 p-2">
                  <h2 className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    {STAGE_LABELS[stage]}
                    <span className="rounded-full bg-white px-2 py-0.5 text-ink">{items.length}</span>
                  </h2>
                  <ul className="mt-1 space-y-2">
                    {items.map((lead) => (
                      <li key={lead.id}>
                        <LeadCard lead={lead} />
                      </li>
                    ))}
                    {items.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted">Empty</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Ref", "Customer", "Event", "Date", "City", "Artists", "Stage", "Owner", "Value"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id} className="border-b border-line last:border-0 hover:bg-cream-soft">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-gold-deep hover:underline">{lead.ref}</Link>
                  </td>
                  <td className="px-4 py-3">{lead.contactName}</td>
                  <td className="px-4 py-3">{lead.eventType}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(istDate(lead.eventDate))}</td>
                  <td className="px-4 py-3">{lead.city}</td>
                  <td className="px-4 py-3">{lead.bookings.map((b) => b.name).join(", ") || "—"}</td>
                  <td className="px-4 py-3"><Pill tone={stageTone(lead.stage)}>{STAGE_LABELS[lead.stage]}</Pill></td>
                  <td className="px-4 py-3">{lead.ownerName ?? <span className="text-muted">Unassigned</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3">{lead.valuePaise ? inrCompact(lead.valuePaise) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">No leads match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: LeadRow }) {
  return (
    <Link href={`/leads/${lead.id}`} className="block rounded-lg border border-line bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold-deep">{lead.ref}</span>
        {lead.valuePaise && <span className="text-xs font-medium text-ink">{inrCompact(lead.valuePaise)}</span>}
      </div>
      <p className="mt-1 truncate text-sm font-medium text-ink">{lead.contactName}</p>
      <p className="truncate text-xs text-muted">
        {lead.eventType} · {lead.city} · {formatDate(istDate(lead.eventDate))}
      </p>
      {lead.bookings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {lead.bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-ink-soft">{b.name}</span>
              <Pill tone={availabilityTone(b.availability)}>{AVAILABILITY_LABELS[b.availability]}</Pill>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-muted">{lead.ownerName ?? "Unassigned"}</p>
        {lead.nextFollowUpAt && followUpState(lead.nextFollowUpAt) !== "later" && (
          <Pill tone={followUpState(lead.nextFollowUpAt) === "overdue" ? "danger" : "action"}>
            <AlarmClock className="size-3" aria-hidden />
            {followUpState(lead.nextFollowUpAt) === "overdue" ? "Follow-up overdue" : "Follow-up today"}
          </Pill>
        )}
      </div>
    </Link>
  );
}
