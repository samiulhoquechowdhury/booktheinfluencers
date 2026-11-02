"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import { formatDateWithWeekday, toIstDateKey } from "@repo/utils";
import { BUDGET_BANDS } from "@repo/mock/catalogue/data";
import { api, can, errorMessage, type LeadDetail, type StaffUser } from "@/lib/api";
import { enquiryStatus, receivedAgo, untilEvent } from "@/lib/enquiry-status";
import { inr, istDate } from "@/lib/format";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Card, Failure, Loading, Modal, Pill, inputClass } from "@/components/ui";
import { CustomerMessages } from "@/components/lead/customer-messages";
import { QuoteSection } from "@/components/enquiry/quick-quote";

export default function EnquiryPage() {
  const { id } = useParams<{ id: string }>();
  const { data: staff } = useStaffSession();
  const { data: lead, isPending, error, refetch } = useQuery({ queryKey: keys.lead(id), queryFn: () => api.leads.get(id) });
  if (isPending || !staff) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;
  return <Enquiry lead={lead} staff={staff} />;
}

function Enquiry({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  const today = useMemo(() => toIstDateKey(new Date()), []);
  const status = enquiryStatus({ stage: lead.stage, awaitingApproval: lead.bookings.some((b) => b.quotes.some((q) => q.status === "PENDING_APPROVAL")) });

  return (
    <div className="space-y-5">
      <div>
        <Link href="/enquiries" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          All enquiries
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{lead.customer.name}</h1>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <p className="mt-1 text-sm text-muted">
          {lead.eventType} on {formatDateWithWeekday(istDate(lead.eventDate))} ({untilEvent(lead.eventDate, today)}) in {lead.city} · received {receivedAgo(lead.lead.createdAt).toLowerCase()} · {lead.ref}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Request lead={lead} />
          <QuoteSection lead={lead} staff={staff} />
          <CustomerMessages lead={lead} />
        </div>
        <aside className="min-w-0 space-y-5">
          <Contact lead={lead} />
          <More lead={lead} staff={staff} />
        </aside>
      </div>
    </div>
  );
}

function Request({ lead }: { lead: LeadDetail }) {
  const l = lead.lead;
  const band = BUDGET_BANDS.find((b) => ("minPaise" in b ? b.minPaise : null) === l.budgetMinPaise && ("maxPaise" in b ? b.maxPaise : null) === l.budgetMaxPaise);
  const rows: [string, string | null][] = [
    ["Event", lead.eventType],
    ["Date", formatDateWithWeekday(istDate(lead.eventDate))],
    ["Backup date", l.altDate ? formatDateWithWeekday(istDate(l.altDate)) : null],
    ["City", lead.city],
    ["Venue", l.venue],
    ["Guests", l.audienceSize ? String(l.audienceSize) : null],
    ["Performance length", l.durationMins ? `${l.durationMins} minutes` : null],
    ["Budget", band?.label ?? (l.budgetMaxPaise ? `Up to ${inr(l.budgetMaxPaise)}` : null)],
    ["Language", l.language],
    ["Artists they want", lead.bookings.length ? lead.bookings.map((b) => b.talent.stageName).join(", ") : "None chosen. Suggest one in the quotation."],
    ["Company", l.companyName ? `${l.companyName}${l.gstin ? ` (GSTIN ${l.gstin})` : ""}` : null],
  ];
  return (
    <Card title="What they asked for">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {l.notes && (
        <div className="mt-4 rounded-lg bg-cream-soft p-3 text-sm">
          <p className="text-xs text-muted">Their message</p>
          <p className="mt-1 whitespace-pre-wrap text-ink">{l.notes}</p>
        </div>
      )}
    </Card>
  );
}

function Contact({ lead }: { lead: LeadDetail }) {
  const phone = lead.customer.phone;
  const button = "flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:border-gold";
  return (
    <Card title="Contact">
      <p className="font-medium text-ink">{lead.customer.name}</p>
      {phone && <p className="text-sm text-muted">+91 {phone}</p>}
      {lead.customer.email && <p className="truncate text-sm text-muted">{lead.customer.email}</p>}
      <div className="mt-3 grid gap-2">
        {phone && (
          <a href={`tel:+91${phone}`} className={button}>
            <Phone className="size-4 text-gold-deep" aria-hidden />
            Call
          </a>
        )}
        {phone && (
          <a href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer" className={button}>
            <MessageCircle className="size-4 text-gold-deep" aria-hidden />
            WhatsApp
          </a>
        )}
        {lead.customer.email && (
          <a href={`mailto:${lead.customer.email}`} className={button}>
            <Mail className="size-4 text-gold-deep" aria-hidden />
            Email
          </a>
        )}
      </div>
    </Card>
  );
}

function More({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const end = lead.nextStages.find((s): s is "LOST" | "CANCELLED" => s === "LOST" || s === "CANCELLED");
  const move = useStaffMutation((text: string) => api.leads.move(lead.id, end!, text), "Enquiry closed");

  return (
    <Card title="More">
      <p className="text-sm text-muted">Looked after by {lead.ownerName ?? "nobody yet. Sending a quote makes it yours."}</p>
      <Link href={`/leads/${lead.id}`} className="mt-3 flex items-center gap-2 text-sm font-medium text-gold-deep hover:underline">
        <ExternalLink className="size-4" aria-hidden />
        Full booking page (contract, payments, notes)
      </Link>
      {end && can(staff, "SALES") && (
        <button type="button" onClick={() => setEnding(true)} className="mt-3 cursor-pointer text-sm font-medium text-rose-700 hover:underline">
          Customer isn't going ahead
        </button>
      )}
      {ending && end && (
        <Modal title="Close this enquiry?" onClose={() => setEnding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              move.mutate(reason, { onSuccess: () => { setEnding(false); setReason(""); } });
            }}
          >
            <p className="text-sm text-ink-soft">It moves to the Closed tab. This can't be undone.</p>
            <label className="mt-4 block text-sm font-medium text-ink">
              Why?
              <input value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus placeholder="For example, chose another agency" className={`${inputClass} mt-1 font-normal`} />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEnding(false)} className="btn btn-outline btn-sm">Keep it open</button>
              <button type="submit" disabled={!reason.trim() || move.isPending} className="btn btn-dark btn-sm disabled:opacity-50">Close enquiry</button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
