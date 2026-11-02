"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, MapPin, Search } from "lucide-react";
import { formatDate, toIstDateKey } from "@repo/utils";
import { api, errorMessage, type LeadRow } from "@/lib/api";
import { ENQUIRY_TABS, enquiryStatus, receivedAgo, untilEvent, type EnquiryTab } from "@/lib/enquiry-status";
import { inrCompact, istDate } from "@/lib/format";
import { keys } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

export default function EnquiriesPage() {
  const [tab, setTab] = useState<EnquiryTab>("new");
  const [q, setQ] = useState("");
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.leads, queryFn: api.leads.list });
  const today = useMemo(() => toIstDateKey(new Date()), []);

  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;

  const text = q.trim().toLowerCase();
  const found = data.filter((lead) => !text || `${lead.ref} ${lead.contactName} ${lead.customerPhone} ${lead.city} ${lead.eventType} ${lead.bookings.map((b) => b.name).join(" ")}`.toLowerCase().includes(text));
  const inTab = (id: EnquiryTab) => found.filter((lead) => enquiryStatus(lead).tab === id);
  // Most urgent first: requests by age, everything else by event date.
  const rows = inTab(tab).toSorted((a, b) => (tab === "new" ? a.createdAt.localeCompare(b.createdAt) : a.eventDate.localeCompare(b.eventDate)));
  const current = ENQUIRY_TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-4">
      <PageHeader title="Enquiries" description="Requests from customers on the website. Open one to see what they want and send a quotation." />

      <div role="tablist" aria-label="Enquiry status" className="flex flex-wrap gap-1.5">
        {ENQUIRY_TABS.map((t) => {
          const on = t.id === tab;
          const count = inTab(t.id).length;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}
            >
              {t.label}
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${on ? "bg-white/15" : t.id === "new" && count > 0 ? "bg-rose-100 text-rose-700" : "bg-cream text-muted"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, city or artist" aria-label="Search enquiries" className={`${inputClass} pl-9`} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">{text ? "No enquiries match your search." : current.empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((lead) => (
            <li key={lead.id}>
              <EnquiryRow lead={lead} today={today} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EnquiryRow({ lead, today }: { lead: LeadRow; today: string }) {
  const status = enquiryStatus(lead);
  const artists = lead.bookings.map((b) => b.name);
  const action = status.tab === "new" ? (lead.awaitingApproval ? "Review" : status.label === "Customer wants changes" ? "Revise quote" : "Send quote") : "Open";
  return (
    <Link href={`/enquiries/${lead.id}`} className="group flex items-center gap-4 rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-md">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-semibold text-ink">{lead.contactName}</p>
          <Pill tone={status.tone}>{status.label}</Pill>
          <span className="text-xs text-muted">{receivedAgo(lead.createdAt)}</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {lead.eventType} with {artists.length ? artists.join(", ") : "any artist (none chosen yet)"}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden />
            {formatDate(istDate(lead.eventDate))} ({untilEvent(lead.eventDate, today)})
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {lead.city}
          </span>
          {lead.valuePaise && <span>Quoted {inrCompact(lead.valuePaise)}</span>}
        </p>
      </div>
      <span className={`flex shrink-0 items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold ${action === "Open" ? "text-ink-soft" : "bg-ink text-white"}`}>
        <span className="max-sm:hidden">{action}</span>
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}
