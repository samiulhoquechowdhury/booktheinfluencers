"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Check, LoaderCircle, MessageSquare, Send, X } from "lucide-react";
import { formatDate, formatDateTime } from "@repo/utils";
import { PdfButton } from "@/components/pdf-button";
import { api, can, seesFinance, type DemoAction, type LeadBooking, type StaffUser } from "@/lib/api";
import { AVAILABILITY_LABELS, MILESTONE_LABELS, QUOTE_LABELS, availabilityTone, inr, percent } from "@/lib/format";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Pill, inputClass } from "@/components/ui";
import { QuoteBuilder } from "./quote-builder";

type NoteAction = "completeEvent" | "cancelBooking";
type StepState = "done" | "current" | "todo" | "stopped";

const DATE_SUMMARY: Record<LeadBooking["availability"], string> = {
  NOT_CHECKED: "Not asked yet.",
  AWAITING_MANAGER: "Asked. Record their answer here when you hear back.",
  HOLD_REQUESTED: "Asked. Record their answer here when you hear back.",
  AVAILABLE: "They're free on this date.",
  TENTATIVE: "Pencilled in, but not firm yet.",
  CONFIRMED: "The date is confirmed.",
  UNAVAILABLE: "They can't do this date. Add another artist to this lead.",
};

/** One artist's booking as a checklist, top to bottom. Each button sits in the step it belongs to. */
export function BookingPanel({ booking, staff }: { booking: LeadBooking; staff: StaffUser }) {
  const [building, setBuilding] = useState(false);
  const [noteFor, setNoteFor] = useState<NoteAction | null>(null);
  const [note, setNote] = useState("");
  const [utrFor, setUtrFor] = useState<string | null>(null);
  const [utr, setUtr] = useState("");
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showMessages, setShowMessages] = useState(false);

  const act = useStaffMutation(({ action, text }: { action: DemoAction; text?: string }) => api.bookings.action(booking.id, action, text), "Booking updated");
  const approve = useStaffMutation((id: string) => api.quotes.approve(id), "Quote approved and sent");
  const reject = useStaffMutation(({ id, reason }: { id: string; reason: string }) => api.quotes.reject(id, reason), "Quote rejected");
  const link = useStaffMutation((id: string) => api.payments.link(id), "Payment link sent");
  const manual = useStaffMutation(({ id, ref }: { id: string; ref: string }) => api.payments.manual(id, ref), "Payment recorded");

  const a = booking.availability;
  const open = !booking.cancelledAt && !booking.completedAt;
  const accepted = booking.quotes.find((q) => q.status === "ACCEPTED");
  const live = booking.quotes.find((q) => q.status === "SENT" || q.status === "PENDING_APPROVAL");
  const canQuote = open && (a === "AVAILABLE" || a === "TENTATIVE") && !accepted && can(staff, "SALES");
  const finance = seesFinance(staff);
  const answering = can(staff, "TALENT_MANAGER", "SALES");
  const asked = ["AWAITING_MANAGER", "HOLD_REQUESTED"].includes(a);

  const steps = [
    a === "AVAILABLE" || a === "TENTATIVE" || a === "CONFIRMED",
    Boolean(accepted),
    Boolean(booking.repAcceptedAt),
    booking.contract?.status === "SIGNED",
    booking.milestones.some((m) => m.isAdvance && m.status === "PAID"),
    Boolean(booking.completedAt) && booking.payout?.status === "PAID",
  ];
  const firstOpen = steps.indexOf(false);
  const state = (i: number): StepState => (steps[i] ? "done" : i === 0 && a === "UNAVAILABLE" ? "stopped" : i === firstOpen ? "current" : "todo");
  // Every step to the advance is done, yet it didn't confirm: another customer confirmed this date first.
  const stuck = open && steps.slice(0, 5).every(Boolean) && a !== "CONFIRMED";

  const quoteSummary = accepted
    ? `Accepted at ${inr(accepted.totalPaise)}.`
    : live?.status === "PENDING_APPROVAL"
      ? "Waiting for a super admin to approve it."
      : live
        ? "Sent. Waiting for the customer to accept."
        : canQuote
          ? "Ready to build."
          : "Available once the date is confirmed with the artist's team.";
  const contractSummary = !booking.contract
    ? accepted
      ? "Ready to send."
      : "Available once the customer accepts a quote."
    : booking.contract.status === "SIGNED"
      ? `Signed by ${booking.contract.signedName} on ${formatDateTime(booking.contract.signedAt!)}.`
      : `Sent ${formatDateTime(booking.contract.sentAt)}. Waiting for the customer to sign.`;
  const payoutSummary = booking.payout
    ? `Artist payout ${finance ? `of ${inr(booking.payout.amountPaise)} ` : ""}${booking.payout.status === "PAID" ? "is paid." : "is waiting to be paid."}`
    : a === "CONFIRMED"
      ? "Mark the event completed once it has happened. This creates the artist's payout."
      : "Available once the booking is confirmed.";

  return (
    <article id={`booking-${booking.id}`} className="scroll-mt-4 rounded-xl border border-line bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold text-ink">
            {booking.talent.stageName}
            {booking.talent.verified && <BadgeCheck className="size-4 text-gold-deep" aria-label="Verified rep" />}
          </h3>
          <p className="text-xs text-muted">{booking.talent.headline} · {booking.talent.tier === "PREMIUM" ? "Premium" : "Standard"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={availabilityTone(a)}>{AVAILABILITY_LABELS[a]}</Pill>
          {booking.cancelledAt && <Pill tone="danger">Cancelled</Pill>}
          {booking.completedAt && <Pill tone="neutral">Completed</Pill>}
        </div>
      </header>

      <div className="p-5">
        {stuck && (
          <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Every step is done, but this didn't confirm. The date was probably taken by another customer first, so check Notes and history, then refund the advance or move the date.
          </p>
        )}

        <ol>
          <Step number={1} title="Check the date with the artist's team" state={state(0)} summary={DATE_SUMMARY[a]}>
            {open && answering && a === "NOT_CHECKED" && (
              <ActionButton primary disabled={act.isPending} onClick={() => act.mutate({ action: "startAvailabilityCheck" })}>Ask the artist's team</ActionButton>
            )}
            {open && answering && (asked || a === "TENTATIVE") && (
              <ActionButton primary disabled={act.isPending} onClick={() => act.mutate({ action: "markAvailable" })}>They're free</ActionButton>
            )}
            {open && answering && asked && (
              <ActionButton disabled={act.isPending} onClick={() => act.mutate({ action: "markTentative" })}>Tentative</ActionButton>
            )}
            {open && answering && (asked || a === "TENTATIVE" || a === "AVAILABLE") && !accepted && (
              <ActionButton disabled={act.isPending} onClick={() => act.mutate({ action: "markUnavailable" })}>They can't do it</ActionButton>
            )}
          </Step>

          <Step number={2} title="Send a quote" state={state(1)} summary={quoteSummary}>
            {canQuote && !building && (
              <ActionButton primary={!live} onClick={() => setBuilding(true)}>{live ? "Revise quote" : "Build quote"}</ActionButton>
            )}
            {building && (
              <div className="w-full rounded-lg border border-line p-4">
                <QuoteBuilder bookingId={booking.id} staff={staff} onDone={() => setBuilding(false)} />
              </div>
            )}
            {booking.quotes.length > 0 && (
              <ul className="w-full divide-y divide-line rounded-lg border border-line">
                {booking.quotes.map((q) => (
                  <li key={q.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        Version {q.version} · {inr(q.totalPaise)}
                        {finance && q.internalCostPaise && (
                          <span className="ml-2 text-xs font-normal text-emerald-800">
                            margin {inr(BigInt(q.subtotalPaise) - BigInt(q.internalCostPaise))}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <PdfButton kind="quote" id={q.id} />
                        <span className="text-xs text-muted">valid to {formatDate(q.validUntil)}</span>
                        <Pill tone={q.status === "ACCEPTED" ? "success" : q.status === "PENDING_APPROVAL" || q.status === "SENT" ? "action" : "neutral"}>{QUOTE_LABELS[q.status]}</Pill>
                      </span>
                    </div>
                    {q.changeRequest && q.status === "SENT" && <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-900">Customer asked: “{q.changeRequest}”</p>}
                    <p className="mt-1 text-xs text-muted">
                      {q.lineItems.map((l) => `${l.description} ${inr(l.customerAmountPaise)}`).join(" · ")} · plan {q.milestonePlan.map((p) => `${p.label} ${percent(p.percentBps)}`).join(" / ")}
                    </p>
                    {q.status === "PENDING_APPROVAL" && can(staff, "SUPER_ADMIN") && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={approve.isPending} onClick={() => approve.mutate(q.id)} className="btn btn-gold btn-sm">Approve and send</button>
                        {rejectFor === q.id ? (
                          <form
                            className="flex flex-1 gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              reject.mutate({ id: q.id, reason: rejectReason }, { onSuccess: () => { setRejectFor(null); setRejectReason(""); } });
                            }}
                          >
                            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required placeholder="Why? (sales will see this)" className={`${inputClass} min-w-0 flex-1`} />
                            <button type="submit" className="btn btn-dark btn-sm">Reject</button>
                          </form>
                        ) : (
                          <button type="button" onClick={() => setRejectFor(q.id)} className="btn btn-outline btn-sm">Reject</button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Step>

          <Step number={3} title="Get the artist team's acceptance" state={state(2)} summary={booking.repAcceptedAt ? `Accepted on ${formatDateTime(booking.repAcceptedAt)}.` : "They agree to the booking terms. Record it here once they do."}>
            {open && !booking.repAcceptedAt && (a === "AVAILABLE" || a === "TENTATIVE") && can(staff, "TALENT_MANAGER") && (
              <ActionButton primary={firstOpen === 2} disabled={act.isPending} onClick={() => act.mutate({ action: "recordRepAcceptance" })}>They've accepted</ActionButton>
            )}
          </Step>

          <Step number={4} title="Get the contract signed" state={state(3)} summary={contractSummary}>
            {open && accepted && !booking.contract && can(staff, "SALES", "OPS") && (
              <ActionButton primary disabled={act.isPending} onClick={() => act.mutate({ action: "sendContract" })}>Send contract to sign</ActionButton>
            )}
            {booking.contract && <PdfButton kind="contract" id={booking.contract.id} label="Agreement PDF" />}
          </Step>

          <Step number={5} title="Collect the payments" state={state(4)} summary={booking.milestones.length ? "The booking confirms itself once the advance is paid, if steps 1 to 4 are done." : "The payment plan appears once the customer accepts a quote."}>
            {booking.milestones.length > 0 && (
              <ul className="w-full divide-y divide-line rounded-lg border border-line">
                {booking.milestones.map((m) => (
                  <li key={m.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">{m.label} · {inr(m.amountPaise)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted">
                          {m.status === "PAID" && m.payment ? `${m.payment.method === "bank_transfer" ? "Bank transfer" : m.payment.method} · ${m.payment.gatewayPaymentId}` : `due ${formatDate(m.dueDate)}`}
                        </span>
                        <Pill tone={m.status === "PAID" ? "success" : m.status === "CANCELLED" ? "neutral" : "action"}>{MILESTONE_LABELS[m.status]}</Pill>
                      </span>
                    </div>
                    {m.status !== "PAID" && m.status !== "CANCELLED" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(m.status === "PENDING" || m.status === "OVERDUE") && can(staff, "ACCOUNTS", "SALES") && (
                          <button type="button" disabled={link.isPending} onClick={() => link.mutate(m.id)} className="btn btn-outline btn-sm">Send payment link</button>
                        )}
                        {can(staff, "ACCOUNTS") &&
                          (utrFor === m.id ? (
                            <form
                              className="flex flex-1 gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                manual.mutate({ id: m.id, ref: utr }, { onSuccess: () => { setUtrFor(null); setUtr(""); } });
                              }}
                            >
                              <input value={utr} onChange={(e) => setUtr(e.target.value)} required placeholder="Bank transfer reference (UTR)" className={`${inputClass} min-w-0 flex-1`} />
                              <button type="submit" disabled={manual.isPending} className="btn btn-dark btn-sm">Record</button>
                              <button type="button" onClick={() => setUtrFor(null)} className="btn btn-outline btn-sm">Back</button>
                            </form>
                          ) : (
                            <button type="button" onClick={() => setUtrFor(m.id)} className="btn btn-outline btn-sm">Record bank transfer</button>
                          ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Step>

          <Step number={6} title="Finish the event and pay the artist" state={state(5)} summary={payoutSummary} last>
            {open && a === "CONFIRMED" && can(staff, "OPS") && noteFor !== "completeEvent" && (
              <ActionButton primary onClick={() => setNoteFor("completeEvent")}>Mark event completed</ActionButton>
            )}
            {noteFor === "completeEvent" && (
              <NoteForm placeholder="How did the event go?" saveLabel="Mark completed" value={note} onChange={setNote} busy={act.isPending} onCancel={() => setNoteFor(null)} onSave={() => act.mutate({ action: "completeEvent", text: note }, { onSuccess: () => { setNoteFor(null); setNote(""); } })} />
            )}
            {booking.payout && booking.payout.status !== "PAID" && can(staff, "ACCOUNTS") && (
              <ActionButton primary disabled={act.isPending} onClick={() => act.mutate({ action: "markPayoutPaid" })}>Mark payout paid</ActionButton>
            )}
          </Step>
        </ol>

        <footer className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setShowMessages(!showMessages)} aria-expanded={showMessages} className="flex items-center gap-2 text-sm font-medium text-gold-deep hover:underline">
              <MessageSquare className="size-4" aria-hidden />
              {showMessages ? "Hide" : "Show"} messages with {booking.talent.stageName.split(" ")[0]}'s team ({booking.messageCount})
            </button>
            {open && can(staff, "SALES", "OPS") && noteFor !== "cancelBooking" && (
              <button type="button" onClick={() => setNoteFor("cancelBooking")} className="cursor-pointer text-sm font-medium text-rose-700 hover:underline">Remove this artist's booking</button>
            )}
          </div>
          {noteFor === "cancelBooking" && (
            <NoteForm placeholder="Why is it being cancelled? Mention the cancellation policy" saveLabel="Cancel this booking" value={note} onChange={setNote} busy={act.isPending} onCancel={() => setNoteFor(null)} onSave={() => act.mutate({ action: "cancelBooking", text: note }, { onSuccess: () => { setNoteFor(null); setNote(""); } })} />
          )}
          {showMessages && <TalentThread bookingId={booking.id} />}
        </footer>
      </div>
    </article>
  );
}

function Step({ number, title, state, summary, last = false, children }: { number: number; title: string; state: StepState; summary: string; last?: boolean; children?: ReactNode }) {
  const marker = {
    done: "bg-emerald-100 text-emerald-800",
    current: "bg-ink text-white",
    todo: "bg-cream text-muted",
    stopped: "bg-rose-100 text-rose-700",
  }[state];
  const words = { done: "Done", current: "Do this now", todo: "Not yet", stopped: "Stopped" }[state];
  return (
    <li aria-current={state === "current" ? "step" : undefined} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center">
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${marker}`}>
          {state === "done" ? <Check className="size-4" aria-hidden /> : state === "stopped" ? <X className="size-4" aria-hidden /> : number}
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-line" />}
      </div>
      <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
        <h4 className={`flex flex-wrap items-center gap-2 pt-1 text-sm font-semibold ${state === "todo" ? "text-muted" : "text-ink"}`}>
          {title}
          <span className={state === "current" ? "rounded-full bg-gold/25 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-deep" : "sr-only"}>{words}</span>
        </h4>
        <p className="mt-0.5 text-sm text-muted">{summary}</p>
        {children && <div className="mt-2 flex flex-wrap items-center gap-2 empty:hidden">{children}</div>}
      </div>
    </li>
  );
}

function ActionButton({ primary = false, disabled = false, onClick, children }: { primary?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`btn btn-sm disabled:opacity-50 ${primary ? "btn-dark" : "btn-outline"}`}>
      {children}
    </button>
  );
}

function NoteForm({ placeholder, saveLabel, value, onChange, busy, onSave, onCancel }: { placeholder: string; saveLabel: string; value: string; onChange: (text: string) => void; busy: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <form
      className="flex w-full flex-wrap gap-2 rounded-lg bg-cream-soft p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <input value={value} onChange={(e) => onChange(e.target.value)} required autoFocus placeholder={placeholder} aria-label={placeholder} className={`${inputClass} min-w-0 flex-1 basis-56`} />
      <button type="submit" disabled={!value.trim() || busy} className="btn btn-dark btn-sm disabled:opacity-50">{saveLabel}</button>
      <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">Back</button>
    </form>
  );
}

function TalentThread({ bookingId }: { bookingId: string }) {
  const [body, setBody] = useState("");
  const { data, isPending } = useQuery({ queryKey: keys.talentMessages(bookingId), queryFn: () => api.bookings.messages(bookingId) });
  const send = useStaffMutation((text: string) => api.bookings.replyToTalent(bookingId, text));
  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      {isPending ? (
        <LoaderCircle className="size-4 animate-spin text-muted" aria-hidden />
      ) : data && data.length > 0 ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {data.map((m) => (
            <li key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.author === "staff" ? "ml-8 bg-ink text-white" : "mr-8 bg-cream"}`}>
              <span className="text-xs font-semibold opacity-70">{m.authorName} · {formatDateTime(m.at)}</span>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No messages with the artist's team yet.</p>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate(body, { onSuccess: () => setBody("") });
        }}
      >
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message the artist's team…" aria-label="Message to the artist's team" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" disabled={!body.trim() || send.isPending} aria-label="Send" className="btn btn-dark btn-sm disabled:opacity-50">
          <Send aria-hidden />
        </button>
      </form>
    </div>
  );
}
