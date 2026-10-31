"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, ArrowRight, Columns3, Hourglass, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { followUpState } from "@/components/lead/follow-ups";
import { formatDate, type LeadStage } from "@repo/utils";
import { CATEGORIES } from "@repo/mock/catalogue/data";
import { api, errorMessage, type LeadRow } from "@/lib/api";
import { PIPELINE_COLUMNS, STAGE_LABELS, inrCompact, istDate, stageTone } from "@/lib/format";
import { keys, useStaffSession } from "@/lib/hooks";
import { FINISHED, PHASES, nextStep } from "@/lib/lead-guide";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

export default function PipelinePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Pipeline />
    </Suspense>
  );
}

type Show = "open" | "attention" | "mine" | "unassigned" | "closed";

const needsAttention = (lead: LeadRow) => !lead.ownerName || (lead.nextFollowUpAt !== null && followUpState(lead.nextFollowUpAt) !== "later");

function Pipeline() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: staff } = useStaffSession();
  const view = params.get("view") === "table" ? "table" : "board";
  const show = (params.get("show") ?? "open") as Show;
  const filters = {
    owner: params.get("owner") ?? "",
    stage: params.get("stage") ?? "",
    city: params.get("city") ?? "",
    category: params.get("category") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
  const q = params.get("q") ?? "";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const filterCount = Object.values(filters).filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(filterCount > 0);
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.leads, queryFn: api.leads.list });

  const matching = useMemo(() => {
    if (!data) return [];
    const text = q.toLowerCase();
    return data.filter(
      (lead) =>
        (!text || `${lead.ref} ${lead.contactName} ${lead.customerPhone} ${lead.bookings.map((b) => b.name).join(" ")}`.toLowerCase().includes(text)) &&
        (!filters.owner || (filters.owner === "unassigned" ? !lead.ownerName : lead.ownerName === filters.owner)) &&
        (!filters.stage || lead.stage === filters.stage) &&
        (!filters.city || lead.city === filters.city) &&
        (!filters.category || lead.categories.includes(filters.category)) &&
        (!filters.from || lead.eventDate >= filters.from) &&
        (!filters.to || lead.eventDate <= filters.to),
    );
  }, [data, q, filters.owner, filters.stage, filters.city, filters.category, filters.from, filters.to]);

  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;

  const owners = [...new Set(data.map((l) => l.ownerName).filter((o): o is string => Boolean(o)))].sort();
  const cities = [...new Set(data.map((l) => l.city))].sort();
  const finishedFilter = FINISHED.includes(filters.stage as LeadStage);
  const live = matching.filter((l) => !FINISHED.includes(l.stage));
  const tabs: { id: Show; label: string; rows: LeadRow[] }[] = [
    { id: "open", label: "All open", rows: live },
    { id: "attention", label: "Needs attention", rows: live.filter(needsAttention) },
    { id: "mine", label: "My leads", rows: live.filter((l) => l.ownerName === staff?.name) },
    { id: "unassigned", label: "Unassigned", rows: live.filter((l) => !l.ownerName) },
    { id: "closed", label: "Closed", rows: matching.filter((l) => FINISHED.includes(l.stage)) },
  ];
  const tab = finishedFilter ? tabs[4]! : (tabs.find((t) => t.id === show) ?? tabs[0]!);
  const rows = tab.rows;
  const asTable = view === "table" || tab.id === "closed";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description="Every enquiry, from first contact to final payment. Open a lead to see what to do next."
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
                {option === "board" ? "Board" : "List"}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const on = t.id === tab.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => set({ show: t.id === "open" ? "" : t.id, ...(finishedFilter && { stage: "" }) })}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}
            >
              {t.label} <span className={on ? "text-white/70" : "text-muted"}>{t.rows.length}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => set({ q: e.target.value })} placeholder="Search name, phone, reference or artist" aria-label="Search" className={`${inputClass} min-w-0 pl-9`} />
        </div>
        <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} className="btn btn-outline btn-sm">
          <SlidersHorizontal aria-hidden />
          Filters{filterCount > 0 && ` (${filterCount})`}
        </button>
        {(filterCount > 0 || q) && (
          <button type="button" onClick={() => router.replace(view === "table" ? `${pathname}?view=table` : pathname)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-cream hover:text-ink">
            <X className="size-4" aria-hidden />
            Clear all
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="grid gap-3 rounded-xl border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterField label="Owner">
            <select value={filters.owner} onChange={(e) => set({ owner: e.target.value })} className={inputClass}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {owners.map((o) => <option key={o}>{o}</option>)}
            </select>
          </FilterField>
          <FilterField label="Stage">
            <select value={filters.stage} onChange={(e) => set({ stage: e.target.value })} className={inputClass}>
              <option value="">Any stage</option>
              {[...PIPELINE_COLUMNS, ...FINISHED].map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          </FilterField>
          <FilterField label="City">
            <select value={filters.city} onChange={(e) => set({ city: e.target.value })} className={inputClass}>
              <option value="">Any city</option>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FilterField>
          <FilterField label="Category">
            <select value={filters.category} onChange={(e) => set({ category: e.target.value })} className={inputClass}>
              <option value="">Any category</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Event from">
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} className={inputClass} />
          </FilterField>
          <FilterField label="Event to">
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} className={inputClass} />
          </FilterField>
        </div>
      )}

      {!asTable ? (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-5">
          {PHASES.map((phase) => {
            const items = rows.filter((l) => phase.stages.includes(l.stage));
            return (
              <section key={phase.id} aria-label={phase.label} className="min-w-0 rounded-xl bg-cream/70 p-2">
                <div className="px-2 py-1.5">
                  <h2 className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                    {phase.label}
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs">{items.length}</span>
                  </h2>
                  <p className="text-xs text-muted">{phase.hint}</p>
                </div>
                <ul className="mt-1 space-y-2">
                  {items.map((lead) => (
                    <li key={lead.id}>
                      <LeadCard lead={lead} />
                    </li>
                  ))}
                  {items.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted">Nothing here</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Customer", "Event", "Date", "Stage", "Next step", "Owner", "Value"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id} className="border-b border-line last:border-0 hover:bg-cream-soft">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-ink hover:underline">{lead.contactName}</Link>
                    <span className="block text-xs text-gold-deep">{lead.ref}</span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.eventType}
                    <span className="block text-xs text-muted">{lead.city} · {lead.bookings.map((b) => b.name).join(", ") || "No artists yet"}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(istDate(lead.eventDate))}</td>
                  <td className="px-4 py-3"><Pill tone={stageTone(lead.stage)}>{STAGE_LABELS[lead.stage]}</Pill></td>
                  <td className="px-4 py-3"><NextStepLine lead={lead} /></td>
                  <td className="px-4 py-3">{lead.ownerName ?? <span className="text-muted">Unassigned</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3">{lead.valuePaise ? inrCompact(lead.valuePaise) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">No leads here.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="min-w-0 text-xs font-medium text-muted">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NextStepLine({ lead }: { lead: LeadRow }) {
  const step = nextStep(lead);
  if (!step) return <span className="text-xs text-muted">Finished</span>;
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${step.waiting ? "text-muted" : "text-gold-deep"}`}>
      {step.waiting ? <Hourglass className="size-3.5 shrink-0" aria-hidden /> : <ArrowRight className="size-3.5 shrink-0" aria-hidden />}
      {step.title}
    </span>
  );
}

function LeadCard({ lead }: { lead: LeadRow }) {
  const due = lead.nextFollowUpAt ? followUpState(lead.nextFollowUpAt) : "later";
  return (
    <Link href={`/leads/${lead.id}`} className="block rounded-lg border border-line bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-ink">{lead.contactName}</p>
        {lead.valuePaise && <span className="shrink-0 text-xs font-medium text-ink">{inrCompact(lead.valuePaise)}</span>}
      </div>
      <p className="truncate text-xs text-muted">
        {lead.eventType} · {lead.city} · {formatDate(istDate(lead.eventDate))}
      </p>
      {lead.bookings.length > 0 && <p className="mt-1 truncate text-xs text-ink-soft">{lead.bookings.map((b) => b.name).join(", ")}</p>}
      <div className="mt-2 border-t border-line pt-2">
        <NextStepLine lead={lead} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <p className="min-w-0 truncate text-xs text-muted">{lead.ownerName ?? "Unassigned"} · {STAGE_LABELS[lead.stage]}</p>
        {due !== "later" && (
          <Pill tone={due === "overdue" ? "danger" : "action"}>
            <AlarmClock className="size-3" aria-hidden />
            {due === "overdue" ? "Overdue" : "Today"}
          </Pill>
        )}
      </div>
    </Link>
  );
}
