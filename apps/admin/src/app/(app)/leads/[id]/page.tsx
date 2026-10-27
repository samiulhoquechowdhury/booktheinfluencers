"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lock, Phone, Send } from "lucide-react";
import { formatDateTime, formatDateWithWeekday, type LeadStage } from "@repo/utils";
import { BUDGET_BANDS } from "@repo/mock/catalogue/data";
import { api, can, errorMessage, type LeadDetail, type StaffUser } from "@/lib/api";
import { STAGE_LABELS, inr, istDate, stageTone } from "@/lib/format";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Card, Failure, Loading, Pill, inputClass } from "@/components/ui";
import { FollowUps } from "@/components/lead/follow-ups";
import { BookingPanel } from "@/components/lead/booking-panel";

const NEEDS_REASON: LeadStage[] = ["LOST", "CANCELLED", "EVENT_COMPLETED"];

export default function LeadWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { data: staff } = useStaffSession();
  const { data: lead, isPending, error, refetch } = useQuery({ queryKey: keys.lead(id), queryFn: () => api.leads.get(id) });
  if (isPending || !staff) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;
  return <Workspace lead={lead} staff={staff} />;
}

function Workspace({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/pipeline" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Pipeline
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gold-deep">{lead.ref}</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">
              {lead.eventType} · {lead.city}
            </h1>
            <p className="mt-1 text-sm text-muted">{formatDateWithWeekday(istDate(lead.eventDate))} · for {lead.customer.name}</p>
          </div>
          <Pill tone={stageTone(lead.stage)}>{STAGE_LABELS[lead.stage]}</Pill>
        </div>
      </div>

      <Controls lead={lead} staff={staff} />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {lead.bookings.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">No artists yet. Add one above to start the availability check.</p>
            </Card>
          ) : (
            lead.bookings.map((booking) => <BookingPanel key={booking.id} booking={booking} staff={staff} />)
          )}
        </div>
        <aside className="space-y-5">
          <FollowUps leadId={lead.id} ownerName={lead.ownerName} />
          <Customer lead={lead} />
          <Brief lead={lead} />
          <CustomerMessages lead={lead} />
          <Notes lead={lead} />
        </aside>
      </div>
    </div>
  );
}

function Controls({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  const [to, setTo] = useState<LeadStage | "">("");
  const [reason, setReason] = useState("");
  const [talent, setTalent] = useState("");
  const assign = useStaffMutation((owner: string) => api.leads.assign(lead.id, owner), "Owner assigned");
  const move = useStaffMutation(({ stage, text }: { stage: LeadStage; text?: string }) => api.leads.move(lead.id, stage, text), "Stage updated");
  const add = useStaffMutation((slug: string) => api.leads.addTalent(lead.id, slug), "Artist added");
  // Live lists: staff added in Staff and talents published in Talents show up here.
  const directory = useQuery({ queryKey: ["staff-directory"], queryFn: api.staff.directory });
  const roster = useQuery({ queryKey: keys.talents, queryFn: api.talents.list });
  const owners = (directory.data ?? []).filter((s) => s.roles.includes("SALES") || s.roles.includes("SUPER_ADMIN"));
  const available = (roster.data ?? []).filter((t) => t.status === "PUBLISHED" && !lead.bookings.some((b) => b.talentSlug === t.slug));
  const sales = can(staff, "SALES");

  if (!sales && !can(staff, "TALENT_MANAGER")) return null;

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-white p-4 md:grid-cols-3">
      {sales && (
        <label className="text-xs font-medium text-muted">
          Owner
          <select
            value={lead.ownerName ?? ""}
            onChange={(e) => e.target.value && assign.mutate(e.target.value)}
            disabled={assign.isPending}
            className={`${inputClass} mt-1`}
          >
            <option value="" disabled>Unassigned — pick an owner</option>
            {owners.map((o) => <option key={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {sales && (
        <form
          className="text-xs font-medium text-muted"
          onSubmit={(e) => {
            e.preventDefault();
            if (to) move.mutate({ stage: to, text: reason || undefined }, { onSuccess: () => { setTo(""); setReason(""); } });
          }}
        >
          Move stage
          <div className="mt-1 flex gap-2">
            <select value={to} onChange={(e) => setTo(e.target.value as LeadStage)} className={inputClass} disabled={lead.nextStages.length === 0}>
              <option value="">{lead.nextStages.length ? "Choose next stage…" : "No manual moves from here"}</option>
              {lead.nextStages.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <button type="submit" disabled={!to || move.isPending || (NEEDS_REASON.includes(to as LeadStage) && !reason.trim())} className="btn btn-dark btn-sm disabled:opacity-50">
              Move
            </button>
          </div>
          {to && NEEDS_REASON.includes(to) && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder={to === "EVENT_COMPLETED" ? "Completion note" : "Reason (required)"} className={`${inputClass} mt-2`} />
          )}
          <p className="mt-1 font-normal">Confirmation is automatic once the four conditions are met.</p>
        </form>
      )}

      <form
        className="text-xs font-medium text-muted"
        onSubmit={(e) => {
          e.preventDefault();
          if (talent) add.mutate(talent, { onSuccess: () => setTalent("") });
        }}
      >
        Add artist to shortlist
        <div className="mt-1 flex gap-2">
          <select value={talent} onChange={(e) => setTalent(e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {available.map((t) => <option key={t.slug} value={t.slug}>{t.stageName} — {t.headline}</option>)}
          </select>
          <button type="submit" disabled={!talent || add.isPending} className="btn btn-dark btn-sm disabled:opacity-50">Add</button>
        </div>
      </form>
    </div>
  );
}

function Customer({ lead }: { lead: LeadDetail }) {
  return (
    <Card title="Customer">
      <p className="font-medium text-ink">{lead.customer.name}</p>
      {lead.lead.companyName && <p className="text-sm text-muted">{lead.lead.companyName}{lead.lead.gstin && ` · GSTIN ${lead.lead.gstin}`}</p>}
      <div className="mt-3 space-y-1 text-sm">
        <a href={`tel:+91${lead.customer.phone}`} className="flex items-center gap-2 text-gold-deep hover:underline">
          <Phone className="size-4" aria-hidden />
          +91 {lead.customer.phone}
        </a>
        {lead.customer.email && <a href={`mailto:${lead.customer.email}`} className="block text-gold-deep hover:underline">{lead.customer.email}</a>}
      </div>
    </Card>
  );
}

function Brief({ lead }: { lead: LeadDetail }) {
  const band = BUDGET_BANDS.find((b) => ("minPaise" in b ? b.minPaise : null) === lead.lead.budgetMinPaise && ("maxPaise" in b ? b.maxPaise : null) === lead.lead.budgetMaxPaise);
  const rows: [string, string | null][] = [
    ["Alternate date", lead.lead.altDate],
    ["Venue", lead.lead.venue],
    ["Audience", lead.lead.audienceSize ? String(lead.lead.audienceSize) : null],
    ["Duration", lead.lead.durationMins ? `${lead.lead.durationMins} min` : null],
    ["Budget", band?.label ?? (lead.lead.budgetMaxPaise ? `up to ${inr(lead.lead.budgetMaxPaise)}` : null)],
    ["Language", lead.lead.language],
    ["Notes", lead.lead.notes],
    ["Lost reason", lead.lead.lostReason],
  ];
  return (
    <Card title="Brief">
      <dl className="space-y-2 text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function CustomerMessages({ lead }: { lead: LeadDetail }) {
  const [body, setBody] = useState("");
  const send = useStaffMutation((text: string) => api.leads.reply(lead.id, text), "Reply sent");
  return (
    <Card title={`Messages with ${lead.customer.name.split(" ")[0]}`}>
      {lead.messages.length === 0 ? (
        <p className="text-sm text-muted">No messages yet.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {lead.messages.map((m) => (
            <li key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.author === "staff" ? "ml-6 bg-ink text-white" : "mr-6 bg-cream"}`}>
              <span className="text-xs font-semibold opacity-70">{m.authorName} · {formatDateTime(m.at)}</span>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate(body, { onSuccess: () => setBody("") });
        }}
      >
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to the customer…" aria-label="Reply to the customer" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" disabled={!body.trim() || send.isPending} aria-label="Send" className="btn btn-dark btn-sm disabled:opacity-50">
          <Send aria-hidden />
        </button>
      </form>
    </Card>
  );
}

function Notes({ lead }: { lead: LeadDetail }) {
  const [text, setText] = useState("");
  const add = useStaffMutation((note: string) => api.leads.note(lead.id, note), "Note added");
  return (
    <Card title="Activity">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(text, { onSuccess: () => setText("") });
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an internal note…" aria-label="Internal note" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" disabled={!text.trim() || add.isPending} className="btn btn-dark btn-sm disabled:opacity-50">Add</button>
      </form>
      <ol className="max-h-96 space-y-3 overflow-y-auto border-l border-line pl-4">
        {lead.activities.map((item) => (
          <li key={item.id} className="relative text-sm">
            <span aria-hidden className={`absolute -left-[21px] top-1.5 size-2 rounded-full ${item.internal ? "bg-ink-soft" : "bg-gold"}`} />
            <p className="flex items-center gap-1.5 font-medium text-ink">
              {item.internal && <Lock className="size-3 text-muted" aria-label="Internal" />}
              {item.title}
            </p>
            {item.body && <p className="text-muted">{item.body}</p>}
            <p className="text-xs text-muted">{formatDateTime(item.at)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
