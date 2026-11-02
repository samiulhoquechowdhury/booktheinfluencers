"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, LoaderCircle, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { LineItemType } from "@repo/schemas";
import { formatDate, formatDateWithWeekday } from "@repo/utils";
import { api, can, errorMessage, quoteChecks, type LeadBooking, type LeadDetail, type QuoteDraftLine, type StaffUser } from "@/lib/api";
import { inr, istDate } from "@/lib/format";
import { keys, useStaffMutation } from "@/lib/hooks";
import { PdfButton } from "@/components/pdf-button";
import { Card, Loading, inputClass } from "@/components/ui";

// The quotation part of an enquiry, for anyone. It does the behind-the-scenes steps itself: confirms the artist
// is free, sends the quote, and approves it too when a super admin sends a price below the usual rate.

const LINE_NAMES: Record<LineItemType, string> = {
  TALENT_FEE: "Artist fee",
  TRAVEL: "Travel",
  ACCOMMODATION: "Stay",
  LOCAL_TRANSPORT: "Local transport",
  SECURITY: "Security",
  PRODUCTION: "Sound and production",
  SERVICE_FEE: "Our booking fee",
  OTHER: "Other charge",
};
const ADVANCES = [2500, 5000, 10000];
const toRupees = (paise: string) => (paise && paise !== "0" ? String(BigInt(paise) / 100n) : "");
const toPaise = (rupees: string) => String(BigInt(rupees.replace(/\D/g, "") || "0") * 100n);
const quotable = (b: LeadBooking) => !b.cancelledAt && b.availability !== "UNAVAILABLE" && !b.quotes.some((q) => q.status === "ACCEPTED");

export function QuoteSection({ lead, staff }: { lead: LeadDetail; staff: StaffUser }) {
  const live = lead.bookings.filter((b) => !b.cancelledAt);
  const sales = can(staff, "SALES");
  const choices = live.filter(quotable);
  const [picked, setPicked] = useState(choices[0]?.id ?? "");
  const [writing, setWriting] = useState(false);
  const [addingArtist, setAddingArtist] = useState(choices.length === 0);
  const booking = choices.find((b) => b.id === picked) ?? choices[0];
  const open = !["CLOSED", "LOST", "CANCELLED"].includes(lead.stage);

  return (
    <Card title="Quotation">
      <div className="space-y-4">
        {live.map((b) => <QuoteStatus key={b.id} booking={b} lead={lead} staff={staff} />)}

        {open && sales && (
          <>
            {choices.length > 1 && (writing || !live.some((b) => b.quotes.length)) && (
              <fieldset>
                <legend className="text-sm font-medium text-ink">Quote for</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {choices.map((b) => (
                    <button key={b.id} type="button" aria-pressed={b.id === booking?.id} onClick={() => setPicked(b.id)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm ring-1 ring-inset ${b.id === booking?.id ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line hover:ring-gold"}`}>
                      {b.talent.stageName}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {addingArtist ? (
              <AddArtist lead={lead} onDone={() => setAddingArtist(false)} onCancel={choices.length ? () => setAddingArtist(false) : undefined} />
            ) : booking && (writing || !booking.quotes.some((q) => q.status === "SENT" || q.status === "PENDING_APPROVAL")) ? (
              <QuoteForm key={booking.id} lead={lead} booking={booking} staff={staff} onSent={() => setWriting(false)} onCancel={booking.quotes.length ? () => setWriting(false) : undefined} />
            ) : (
              booking && (
                <button type="button" onClick={() => setWriting(true)} className="btn btn-outline btn-sm">
                  Send a new quote
                </button>
              )
            )}

            {!addingArtist && (
              <button type="button" onClick={() => setAddingArtist(true)} className="block cursor-pointer text-sm font-medium text-gold-deep hover:underline">
                {choices.length ? "Quote a different artist instead" : "Choose an artist to quote"}
              </button>
            )}
          </>
        )}
        {open && !sales && <p className="text-sm text-muted">Only the sales team can send quotations.</p>}
      </div>
    </Card>
  );
}

/** What has happened with this artist's quotes so far, in one line. */
function QuoteStatus({ booking, lead, staff }: { booking: LeadBooking; lead: LeadDetail; staff: StaffUser }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const approve = useStaffMutation((id: string) => api.quotes.approve(id), "Approved and sent to the customer");
  const reject = useStaffMutation(({ id, why }: { id: string; why: string }) => api.quotes.reject(id, why), "Quote rejected");
  const latest = booking.quotes.find((q) => q.status !== "SUPERSEDED");
  const name = booking.talent.stageName;
  if (!latest && booking.availability !== "UNAVAILABLE") return null;

  const box = "rounded-lg border p-3 text-sm";
  if (booking.availability === "UNAVAILABLE") return <p className={`${box} border-line bg-cream-soft text-ink-soft`}>{name} isn't free on this date.</p>;
  if (!latest) return null;
  const amount = `${inr(latest.totalPaise)} for ${name}`;

  if (latest.status === "ACCEPTED") {
    return (
      <div className={`${box} border-emerald-200 bg-emerald-50 text-emerald-950`}>
        <p className="font-semibold">The customer accepted {amount}.</p>
        <p className="mt-1">Next, send the contract and collect the advance on the full booking page.</p>
        <Link href={`/leads/${lead.id}#booking-${booking.id}`} className="btn btn-dark btn-sm mt-2">Open the booking</Link>
      </div>
    );
  }
  if (latest.status === "PENDING_APPROVAL") {
    return (
      <div className={`${box} border-amber-200 bg-amber-50 text-amber-950`}>
        <p className="font-semibold">{amount} is waiting for a super admin to approve it.</p>
        <p className="mt-1">The price is below the usual rate, so the customer hasn't seen it yet.</p>
        {can(staff, "SUPER_ADMIN") && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={approve.isPending} onClick={() => approve.mutate(latest.id)} className="btn btn-dark btn-sm">Approve and send</button>
            {rejecting ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  reject.mutate({ id: latest.id, why: reason }, { onSuccess: () => setRejecting(false) });
                }}
              >
                <input value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus placeholder="Why? The sender will see this" className={`${inputClass} min-w-0 flex-1`} />
                <button type="submit" className="btn btn-outline btn-sm">Reject</button>
              </form>
            ) : (
              <button type="button" onClick={() => setRejecting(true)} className="btn btn-outline btn-sm">Reject</button>
            )}
          </div>
        )}
      </div>
    );
  }
  if (latest.status === "SENT") {
    return (
      <div className={`${box} ${latest.changeRequest ? "border-rose-200 bg-rose-50 text-rose-950" : "border-line bg-cream-soft text-ink"}`}>
        <p className="font-semibold">{latest.changeRequest ? `The customer wants changes to ${amount}.` : `Sent ${amount}. Waiting for the customer to accept.`}</p>
        {latest.changeRequest && <p className="mt-1">They said: “{latest.changeRequest}”. Send a new quote below.</p>}
        <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
          Valid until {formatDate(latest.validUntil)}
          <PdfButton kind="quote" id={latest.id} label="See the quote" />
        </p>
      </div>
    );
  }
  return <p className={`${box} border-line text-muted`}>The last quote for {name} was rejected. Send a new one.</p>;
}

function AddArtist({ lead, onDone, onCancel }: { lead: LeadDetail; onDone: () => void; onCancel?: () => void }) {
  const [slug, setSlug] = useState("");
  const roster = useQuery({ queryKey: keys.talents, queryFn: api.talents.list });
  const add = useStaffMutation((s: string) => api.leads.addTalent(lead.id, s), "Artist added");
  const options = (roster.data ?? []).filter((t) => t.status === "PUBLISHED" && !lead.bookings.some((b) => b.talentSlug === t.slug));
  return (
    <form
      className="rounded-lg border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (slug) add.mutate(slug, { onSuccess: onDone });
      }}
    >
      <label className="text-sm font-medium text-ink">
        Which artist are you quoting for?
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className={`${inputClass} mt-1`}>
          <option value="">Choose an artist</option>
          {options.map((t) => <option key={t.slug} value={t.slug}>{t.stageName} — {t.headline}</option>)}
        </select>
      </label>
      <p className="mt-1 text-xs text-muted">Artists already booked on {formatDateWithWeekday(istDate(lead.eventDate))} can't be added.</p>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={!slug || add.isPending} className="btn btn-dark btn-sm disabled:opacity-50">Continue</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">Back</button>}
      </div>
    </form>
  );
}

function QuoteForm({ lead, booking, staff, onSent, onCancel }: { lead: LeadDetail; booking: LeadBooking; staff: StaffUser; onSent: () => void; onCancel?: () => void }) {
  const draft = useQuery({ queryKey: ["quote-draft", booking.id], queryFn: () => api.quotes.draft(booking.id), staleTime: Infinity });
  if (draft.isPending) return <Loading label="Filling in prices from the rate card" />;
  if (draft.error) return <p role="alert" className="text-sm text-rose-700">{errorMessage(draft.error)}</p>;
  return <Prices lead={lead} booking={booking} staff={staff} initial={draft.data} onSent={onSent} onCancel={onCancel} />;
}

function Prices({ lead, booking, staff, initial, onSent, onCancel }: { lead: LeadDetail; booking: LeadBooking; staff: StaffUser; initial: Awaited<ReturnType<typeof api.quotes.draft>>; onSent: () => void; onCancel?: () => void }) {
  const client = useQueryClient();
  const [lines, setLines] = useState<QuoteDraftLine[]>(initial.lines);
  const [advanceBps, setAdvanceBps] = useState(ADVANCES.includes(initial.advanceBps) ? initial.advanceBps : 5000);
  const [validDays, setValidDays] = useState(initial.validDays);
  const known = booking.availability === "AVAILABLE" || booking.availability === "TENTATIVE";
  const [free, setFree] = useState(known);
  const checks = quoteChecks(lines, initial.rate);
  const approver = can(staff, "SUPER_ADMIN");
  const name = booking.talent.stageName;

  const send = useMutation({
    mutationFn: async () => {
      if (booking.availability === "NOT_CHECKED") await api.bookings.action(booking.id, "startAvailabilityCheck");
      if (!known) await api.bookings.action(booking.id, "markAvailable");
      const quoteId = await api.quotes.create(booking.id, { lines, validDays, advanceBps });
      if (checks.needsApproval && approver) await api.quotes.approve(quoteId);
    },
    onSettled: () => client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "staff" }),
    onSuccess: () => {
      toast.success(checks.needsApproval && !approver ? "Sent to a super admin for approval" : `Quotation sent to ${lead.customer.name}`);
      onSent();
    },
  });

  const update = (index: number, patch: Partial<QuoteDraftLine>) => setLines((all) => all.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const empty = lines.some((l) => !l.description.trim() || l.customerAmountPaise === "0");

  return (
    <form
      className="space-y-4 rounded-lg border border-gold bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <div>
        <h3 className="font-semibold text-ink">Quotation for {name}</h3>
        <p className="text-sm text-muted">Prices are filled in from {name}'s usual rates. Change any of them.</p>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line">
        {lines.map((line, index) => (
          <li key={index} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1 basis-48">
              {line.type === "OTHER" ? (
                <input value={line.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="What is it for? For example, travel" aria-label="What the charge is for" className={inputClass} />
              ) : (
                <>
                  <p className="text-sm font-medium text-ink">{LINE_NAMES[line.type]}</p>
                  <p className="truncate text-xs text-muted">{line.description}</p>
                </>
              )}
            </div>
            <div className="relative w-40">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">₹</span>
              <input inputMode="numeric" value={toRupees(line.customerAmountPaise)} onChange={(e) => update(index, { customerAmountPaise: toPaise(e.target.value) })} aria-label={`${LINE_NAMES[line.type]} in rupees`} placeholder="0" className={`${inputClass} pl-7 text-right`} />
            </div>
            {line.type !== "TALENT_FEE" ? (
              <button type="button" onClick={() => setLines((all) => all.filter((_, i) => i !== index))} aria-label={`Remove ${LINE_NAMES[line.type]}`} className="grid size-9 place-items-center rounded-md text-muted hover:bg-cream hover:text-rose-700">
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : (
              <span className="size-9" aria-hidden />
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setLines((all) => [...all, { type: "OTHER", description: "", customerAmountPaise: "0", internalCostPaise: "0", taxRateBps: 1800 }])} className="btn btn-outline btn-sm">
        <Plus aria-hidden />
        Add a charge (travel, stay, sound…)
      </button>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Payment
          <select value={advanceBps} onChange={(e) => setAdvanceBps(Number(e.target.value))} className={`${inputClass} mt-1`}>
            {ADVANCES.map((bps) => <option key={bps} value={bps}>{bps === 10000 ? "Full amount up front" : `${bps / 100}% to book, rest before the event`}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Customer has to accept within
          <select value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} className={`${inputClass} mt-1`}>
            {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-cream-soft p-4">
        <p className="text-sm text-muted">
          {inr(checks.subtotalPaise)} + GST {inr(checks.taxPaise)}
        </p>
        <p className="text-right">
          <span className="block text-xs text-muted">Customer pays</span>
          <span className="text-2xl font-semibold text-ink">{inr(checks.totalPaise)}</span>
        </p>
      </div>

      {checks.needsApproval ? (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {approver ? "This is below the usual rate. As a super admin, sending it approves it too." : "This is below the usual rate, so a super admin has to approve it before the customer sees it."}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" aria-hidden />
          Within the usual rates. It goes straight to the customer.
        </p>
      )}

      {!known && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm text-ink">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--gold-deep)]" />
          I've checked with {name}'s team that they're free on {formatDateWithWeekday(istDate(lead.eventDate))}.
        </label>
      )}

      {send.isError && <p role="alert" className="text-sm text-rose-700">{errorMessage(send.error)}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!free || empty || send.isPending} className="btn btn-gold disabled:opacity-50">
          {send.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {checks.needsApproval && !approver ? "Send for approval" : `Send quotation to ${lead.customer.name.split(" ")[0]}`}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-outline">
            <X aria-hidden />
            Cancel
          </button>
        )}
      </div>
      {empty && <p className="text-xs text-muted">Fill in a name and an amount for every charge, or remove it.</p>}
    </form>
  );
}
