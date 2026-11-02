"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Hourglass, Lock, Phone, Plus } from "lucide-react";
import { canTransition, formatDateTime, formatDateWithWeekday, type LeadStage } from "@repo/utils";
import { BUDGET_BANDS } from "@repo/mock/catalogue/data";
import { api, can, errorMessage, type LeadDetail, type StaffUser } from "@/lib/api";
import { STAGE_LABELS, inr, istDate, stageTone } from "@/lib/format";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { FINISHED, PHASES, nextStep, phaseIndex } from "@/lib/lead-guide";
import { Card, Failure, Loading, Modal, Pill, inputClass } from "@/components/ui";
import { FollowUps } from "@/components/lead/follow-ups";
import { BookingPanel } from "@/components/lead/booking-panel";
import { CustomerMessages } from "@/components/lead/customer-messages";

/** Moves staff make by hand. The rest happen by themselves as quotes, signatures and payments come in. */
const MOVE_LABELS: Partial<Record<LeadStage, string>> = {
  CONTACTED: "Mark as contacted",
  REQUIREMENT_RECEIVED: "Details confirmed",
  SHORTLISTED: "Shortlist is ready",
  NEGOTIATION: "Customer wants changes",
  QUOTE_SENT: "Back to waiting on the customer",
  ADVANCE_PENDING: "Quote accepted",
  SETTLEMENT: "Move to settlement",
  CLOSED: "Close this lead",
};

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
    <div className="space-y-5">
      <div>
        <Link href={`/enquiries/${lead.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to the enquiry
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gold-deep">{lead.ref}</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">
              {lead.customer.name}: {lead.eventType}
            </h1>
            <p className="mt-1 text-sm text-muted">{formatDateWithWeekday(istDate(lead.eventDate))} · {lead.city}</p>
          </div>
          <Owner lead={lead} staff={staff} />
        </div>
      </div>

      <StageTrack stage={lead.stage} />
      <NextStepCard lead={lead} staff={staff} />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Artists lead={lead} staff={staff} />
          {lead.bookings.map((booking) => <BookingPanel key={booking.id} booking={booking} staff={staff} />)}
        </div>
        <aside className="min-w-0 space-y-5">
          <Customer lead={lead} />
          <FollowUps leadId={lead.id} ownerName={lead.ownerName} />
          <CustomerMessages lead={lead} />
          <Brief lead={lead} />
          <Notes lead={lead} />
        </aside>
      </div>
    </div>
  );
}

function Owner({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  const assign = useStaffMutation((owner: string) => api.leads.assign(lead.id, owner), "Owner assigned");
  const directory = useQuery({ queryKey: ["staff-directory"], queryFn: api.staff.directory });
  // Live list: staff added in Staff show up here.
  const owners = (directory.data ?? []).filter((s) => s.roles.includes("SALES") || s.roles.includes("SUPER_ADMIN"));

  if (!can(staff, "SALES")) return <p className="text-sm text-muted">Owner: {lead.ownerName ?? "Unassigned"}</p>;

  return (
    <label className="w-full text-xs font-medium text-muted sm:w-56">
      Lead owner
      <select value={lead.ownerName ?? ""} onChange={(e) => e.target.value && assign.mutate(e.target.value)} disabled={assign.isPending} className={`${inputClass} mt-1`}>
        <option value="" disabled>Choose an owner</option>
        {lead.ownerName && !owners.some((o) => o.name === lead.ownerName) && <option>{lead.ownerName}</option>}
        {owners.map((o) => <option key={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

/** Where this lead is in the whole journey. */
function StageTrack({ stage }: { stage: LeadStage }) {
  const current = phaseIndex(stage);
  const finished = FINISHED.includes(stage);
  return (
    <ol aria-label="Progress" className="grid gap-1 rounded-xl border border-line bg-white p-2 sm:grid-cols-5">
      {PHASES.map((phase, i) => {
        const done = stage === "CLOSED" || (!finished && i < current);
        const here = i === current;
        return (
          <li key={phase.id} aria-current={here ? "step" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${here ? "bg-ink text-white" : ""}`}>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${here ? "bg-gold text-ink" : done ? "bg-emerald-100 text-emerald-800" : "bg-cream text-muted"}`}>
              {done ? <Check className="size-3.5" aria-label="Done" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-sm font-medium ${here ? "text-white" : done ? "text-ink" : "text-muted"}`}>{phase.label}</span>
              {here && STAGE_LABELS[stage] !== phase.label && <span className="block truncate text-xs text-white/70">{STAGE_LABELS[stage]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The one thing to do now, and the only place a lead changes stage by hand. */
function NextStepCard({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  const [ending, setEnding] = useState<"LOST" | "CANCELLED" | null>(null);
  const [reason, setReason] = useState("");
  const move = useStaffMutation(({ stage, text }: { stage: LeadStage; text?: string }) => api.leads.move(lead.id, stage, text), "Lead updated");
  const sales = can(staff, "SALES");
  const step = nextStep(lead);

  if (!step) {
    return (
      <div className="rounded-xl border border-line bg-white p-5">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <Pill tone={stageTone(lead.stage)}>{STAGE_LABELS[lead.stage]}</Pill>
          {lead.stage === "CLOSED" ? "This lead is finished. Nothing more to do." : "This lead has ended."}
        </p>
        {lead.lead.lostReason && <p className="mt-2 text-sm text-muted">Reason: {lead.lead.lostReason}</p>}
      </div>
    );
  }

  const quotes = lead.bookings.flatMap((b) => b.quotes);
  const facts = {
    actor: "staff" as const,
    ownerSet: Boolean(lead.ownerName),
    bookingCount: lead.bookings.length,
    anyAvailable: lead.bookings.some((b) => b.availability === "AVAILABLE" || b.availability === "TENTATIVE"),
    hasSentQuote: quotes.some((q) => q.status === "SENT"),
    hasAcceptedQuote: quotes.some((q) => q.status === "ACCEPTED"),
    // The server has the final say on closing, as it adds up every payment.
    payoutPaid: true,
    allMilestonesPaid: true,
  };
  const moves = lead.nextStages.flatMap((stage) => {
    const label = stage === "SHORTLISTED" && lead.stage === "AVAILABILITY_CHECK" ? "Back to shortlist" : MOVE_LABELS[stage];
    const automatic = (stage === "QUOTE_SENT" && lead.stage === "AVAILABILITY_CHECK") || (stage === "ADVANCE_PENDING" && !facts.hasAcceptedQuote);
    if (!label || automatic) return [];
    const check = canTransition(lead.stage, stage, facts);
    return [{ stage, label, blocked: check.ok ? null : check.reason }];
  });
  const endStage = lead.nextStages.find((s): s is "LOST" | "CANCELLED" => s === "LOST" || s === "CANCELLED");
  const artist = step.onArtist ? (lead.bookings.find((b) => !b.cancelledAt && b.availability !== "UNAVAILABLE") ?? lead.bookings[0]) : undefined;
  const blockedBy = moves.find((m) => m.blocked)?.blocked;

  return (
    <section aria-label="Next step" className={`rounded-xl border-2 bg-white p-5 ${step.waiting ? "border-line" : "border-gold"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gold-deep">
            {step.waiting ? <Hourglass className="size-3.5" aria-hidden /> : <ArrowRight className="size-3.5" aria-hidden />}
            {step.waiting ? "Waiting" : "Next step"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink">{step.title}</h2>
          <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {artist && (
            <a href={`#booking-${artist.id}`} className={`btn btn-sm ${step.waiting ? "btn-outline" : "btn-dark"}`}>
              Go to {artist.talent.stageName}
            </a>
          )}
          {sales &&
            moves.map((m, i) => (
              <button
                key={m.stage}
                type="button"
                disabled={Boolean(m.blocked) || move.isPending}
                onClick={() => move.mutate({ stage: m.stage })}
                className={`btn btn-sm disabled:opacity-50 ${i === 0 && !artist && !step.waiting ? "btn-dark" : "btn-outline"}`}
              >
                {m.label}
              </button>
            ))}
        </div>
      </div>
      {sales && blockedBy && <p className="mt-3 text-sm text-amber-800">Before moving on: {blockedBy}.</p>}
      {sales && endStage && (
        <button type="button" onClick={() => setEnding(endStage)} className="mt-3 cursor-pointer text-sm font-medium text-rose-700 hover:underline">
          {endStage === "LOST" ? "Customer isn't going ahead? Mark as lost" : "Cancel this lead"}
        </button>
      )}

      {ending && (
        <Modal title={ending === "LOST" ? "Mark this lead as lost?" : "Cancel this lead?"} onClose={() => setEnding(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              move.mutate({ stage: ending, text: reason }, { onSuccess: () => { setEnding(null); setReason(""); } });
            }}
          >
            <p className="text-sm text-ink-soft">This ends the lead and can't be undone. It stays in the Closed tab for your records.</p>
            <label className="mt-4 block text-sm font-medium text-ink">
              Reason
              <input value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus placeholder="For example, chose another agency" className={`${inputClass} mt-1 font-normal`} />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEnding(null)} className="btn btn-outline btn-sm">Keep it open</button>
              <button type="submit" disabled={!reason.trim() || move.isPending} className="btn btn-dark btn-sm disabled:opacity-50">{ending === "LOST" ? "Mark as lost" : "Cancel lead"}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Artists({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  const [talent, setTalent] = useState("");
  const add = useStaffMutation((slug: string) => api.leads.addTalent(lead.id, slug), "Artist added");
  // Live list: talents published in Talents show up here.
  const roster = useQuery({ queryKey: keys.talents, queryFn: api.talents.list });
  const available = (roster.data ?? []).filter((t) => t.status === "PUBLISHED" && !lead.bookings.some((b) => b.talentSlug === t.slug));
  const canAdd = can(staff, "SALES", "TALENT_MANAGER") && !FINISHED.includes(lead.stage);

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-semibold text-ink">Artists on this lead</h2>
        <p className="text-sm text-muted">{lead.bookings.length ? "Follow each artist's checklist from top to bottom." : "No artists yet. Add one to start."}</p>
      </div>
      {canAdd && (
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (talent) add.mutate(talent, { onSuccess: () => setTalent("") });
          }}
        >
          <select value={talent} onChange={(e) => setTalent(e.target.value)} aria-label="Artist to add" className={`${inputClass} min-w-0 sm:w-64`}>
            <option value="">Choose an artist</option>
            {available.map((t) => <option key={t.slug} value={t.slug}>{t.stageName} — {t.headline}</option>)}
          </select>
          <button type="submit" disabled={!talent || add.isPending} className="btn btn-dark btn-sm shrink-0 disabled:opacity-50">
            <Plus aria-hidden />
            Add artist
          </button>
        </form>
      )}
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

function Notes({ lead }: { lead: LeadDetail }) {
  const [text, setText] = useState("");
  const add = useStaffMutation((note: string) => api.leads.note(lead.id, note), "Note added");
  return (
    <Card title="Notes and history">
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
              {item.title.replace(/\b[A-Z_]{3,}\b/g, (word) => STAGE_LABELS[word as LeadStage] ?? word)}
            </p>
            {item.body && <p className="text-muted">{item.body}</p>}
            <p className="text-xs text-muted">{formatDateTime(item.at)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
