"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, LoaderCircle, MessageSquare, Send } from "lucide-react";
import { formatDate, formatDateTime } from "@repo/utils";
import { PdfButton } from "@/components/pdf-button";
import { api, can, seesFinance, type DemoAction, type LeadBooking, type StaffUser } from "@/lib/api";
import { AVAILABILITY_LABELS, MILESTONE_LABELS, QUOTE_LABELS, availabilityTone, inr, percent } from "@/lib/format";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Pill, inputClass } from "@/components/ui";
import { QuoteBuilder } from "./quote-builder";

type NoteAction = "completeEvent" | "cancelBooking";

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

  const buttons: { action: DemoAction; label: string; show: boolean }[] = [
    { action: "startAvailabilityCheck", label: "Ask rep for availability", show: open && a === "NOT_CHECKED" && can(staff, "SALES", "TALENT_MANAGER") },
    { action: "markAvailable", label: "Mark available", show: open && ["AWAITING_MANAGER", "HOLD_REQUESTED", "TENTATIVE"].includes(a) && can(staff, "TALENT_MANAGER", "SALES") },
    { action: "markTentative", label: "Mark tentative", show: open && ["AWAITING_MANAGER", "HOLD_REQUESTED"].includes(a) && can(staff, "TALENT_MANAGER", "SALES") },
    { action: "markUnavailable", label: "Mark unavailable", show: open && ["AWAITING_MANAGER", "HOLD_REQUESTED", "TENTATIVE", "AVAILABLE"].includes(a) && !accepted && can(staff, "TALENT_MANAGER", "SALES") },
    { action: "recordRepAcceptance", label: "Record rep acceptance", show: open && !booking.repAcceptedAt && (a === "AVAILABLE" || a === "TENTATIVE") && can(staff, "TALENT_MANAGER") },
    { action: "sendContract", label: "Send contract for e-sign", show: open && Boolean(accepted) && !booking.contract && can(staff, "SALES", "OPS") },
    { action: "markPayoutPaid", label: "Mark payout paid", show: booking.payout?.status !== "PAID" && Boolean(booking.payout) && can(staff, "ACCOUNTS") },
  ];

  return (
    <article className="rounded-xl border border-line bg-white">
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
          {booking.repAcceptedAt && <Pill tone="success">Rep accepted</Pill>}
          {booking.cancelledAt && <Pill tone="danger">Cancelled</Pill>}
          {booking.completedAt && <Pill tone="neutral">Completed</Pill>}
        </div>
      </header>

      <div className="space-y-5 p-5">
        {(buttons.some((b) => b.show) || canQuote || (open && can(staff, "OPS") && a === "CONFIRMED") || (open && can(staff, "SALES", "OPS"))) && (
          <div className="flex flex-wrap gap-2">
            {buttons.filter((b) => b.show).map((b) => (
              <button key={b.action} type="button" disabled={act.isPending} onClick={() => act.mutate({ action: b.action })} className="btn btn-outline btn-sm disabled:opacity-50">
                {b.label}
              </button>
            ))}
            {canQuote && !building && (
              <button type="button" onClick={() => setBuilding(true)} className="btn btn-dark btn-sm">
                {live ? "Revise quote" : "Build quote"}
              </button>
            )}
            {open && a === "CONFIRMED" && can(staff, "OPS") && (
              <button type="button" onClick={() => setNoteFor("completeEvent")} className="btn btn-outline btn-sm">Mark event completed</button>
            )}
            {open && can(staff, "SALES", "OPS") && (
              <button type="button" onClick={() => setNoteFor("cancelBooking")} className="btn btn-outline btn-sm text-rose-700">Cancel booking</button>
            )}
          </div>
        )}

        {noteFor && (
          <form
            className="flex flex-wrap gap-2 rounded-lg bg-cream-soft p-3"
            onSubmit={(e) => {
              e.preventDefault();
              act.mutate({ action: noteFor, text: note }, { onSuccess: () => { setNoteFor(null); setNote(""); } });
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              placeholder={noteFor === "completeEvent" ? "Completion note (OPS-4)" : "Cancellation reason and policy reference (OPS-5)"}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button type="submit" disabled={!note.trim() || act.isPending} className="btn btn-dark btn-sm disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setNoteFor(null)} className="btn btn-outline btn-sm">Cancel</button>
          </form>
        )}

        {building && (
          <div className="rounded-lg border border-line p-4">
            <h4 className="mb-3 text-sm font-semibold text-ink">Quote builder</h4>
            <QuoteBuilder bookingId={booking.id} staff={staff} onDone={() => setBuilding(false)} />
          </div>
        )}

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Quotes</h4>
          {booking.quotes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No quotes yet.{a === "NOT_CHECKED" || a === "AWAITING_MANAGER" ? " Confirm availability first." : ""}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {booking.quotes.map((q) => (
                <li key={q.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      v{q.version} · {inr(q.totalPaise)}
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
                      <button type="button" disabled={approve.isPending} onClick={() => approve.mutate(q.id)} className="btn btn-gold btn-sm">Approve & send</button>
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
                  {q.status === "PENDING_APPROVAL" && !can(staff, "SUPER_ADMIN") && <p className="mt-1 text-xs text-amber-800">Waiting for a super admin.</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {accepted && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Contract</h4>
              <p className="mt-2 text-sm text-ink">
                {!booking.contract
                  ? "Not sent yet."
                  : booking.contract.status === "SIGNED"
                    ? `Signed by ${booking.contract.signedName} · ${formatDateTime(booking.contract.signedAt!)}`
                    : `Sent ${formatDateTime(booking.contract.sentAt)} · waiting for signature`}
              </p>
              {booking.contract && <div className="mt-1"><PdfButton kind="contract" id={booking.contract.id} label="Agreement PDF" /></div>}
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Payout</h4>
              <p className="mt-2 text-sm text-ink">
                {booking.payout
                  ? `${finance ? inr(booking.payout.amountPaise) + " · " : ""}${booking.payout.status === "PAID" ? "Paid" : "Pending"}`
                  : "Created when the event is completed (SET-1)."}
              </p>
            </div>
          </section>
        )}

        {booking.milestones.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Payments</h4>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
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
                            <button type="button" onClick={() => setUtrFor(null)} className="btn btn-outline btn-sm">Cancel</button>
                          </form>
                        ) : (
                          <button type="button" onClick={() => setUtrFor(m.id)} className="btn btn-outline btn-sm">Record bank transfer</button>
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <button type="button" onClick={() => setShowMessages(!showMessages)} aria-expanded={showMessages} className="flex items-center gap-2 text-sm font-medium text-gold-deep hover:underline">
            <MessageSquare className="size-4" aria-hidden />
            {showMessages ? "Hide" : "Show"} messages with {booking.talent.stageName.split(" ")[0]}'s team ({booking.messageCount})
          </button>
          {showMessages && <TalentThread bookingId={booking.id} />}
        </section>
      </div>
    </article>
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
