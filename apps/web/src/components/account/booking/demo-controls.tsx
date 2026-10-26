"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import type { CustomerBooking } from "@repo/schemas";
import { api } from "@/lib/api/client";
import { useBookingMutation } from "@/lib/api/hooks";
import type { DemoAction } from "@/lib/mock/server";

const ACTIONS: { action: DemoAction; label: string; show: (b: CustomerBooking) => boolean; needsNote?: string }[] = [
  { action: "startAvailabilityCheck", label: "Start availability check", show: (b) => b.availability === "NOT_CHECKED" },
  { action: "markAvailable", label: "Artist is available", show: (b) => ["AWAITING_MANAGER", "HOLD_REQUESTED", "TENTATIVE"].includes(b.availability) },
  { action: "markTentative", label: "Tentatively available", show: (b) => ["AWAITING_MANAGER", "HOLD_REQUESTED"].includes(b.availability) },
  { action: "markUnavailable", label: "Artist unavailable", show: (b) => ["AWAITING_MANAGER", "HOLD_REQUESTED", "TENTATIVE"].includes(b.availability) },
  {
    action: "recordRepAcceptance",
    label: "Rep accepts terms",
    show: (b) => !b.repAccepted && (b.availability === "AVAILABLE" || b.availability === "TENTATIVE"),
  },
  {
    action: "sendQuote",
    label: "Send (revised) quote",
    show: (b) =>
      (b.availability === "AVAILABLE" || b.availability === "TENTATIVE") &&
      !b.quotes.some((q) => q.status === "ACCEPTED") &&
      (!b.quotes.some((q) => q.status === "SENT") || b.quotes.some((q) => q.status === "SENT" && q.changeRequest)),
  },
  { action: "sendContract", label: "Send contract", show: (b) => !b.contract && b.quotes.some((q) => q.status === "ACCEPTED") },
  { action: "completeEvent", label: "Mark event completed", show: (b) => b.availability === "CONFIRMED" && !b.completedAt, needsNote: "Completion note" },
  { action: "markPayoutPaid", label: "Mark artist payout paid", show: (b) => Boolean(b.completedAt) },
  { action: "cancelBooking", label: "Cancel booking", show: (b) => !b.cancelledAt && !b.completedAt, needsNote: "Cancellation reason" },
];

/**
 * Demo-only stand-in for the staff CRM (apps/admin). Each button calls the same mock-server
 * rule a staff member would trigger; confirmation itself is never a button.
 */
export function DemoControls({ booking }: { booking: CustomerBooking }) {
  const run = useBookingMutation(
    ({ action, note }: { action: DemoAction; note?: string }) => api.demo.run(booking.id, action, note),
    { success: "Done — the booking has been updated" },
  );
  const [noteFor, setNoteFor] = useState<DemoAction | null>(null);
  const [note, setNote] = useState("");
  const visible = ACTIONS.filter((a) => a.show(booking));
  if (visible.length === 0) return null;

  return (
    <details className="group rounded-xl border border-dashed border-violet-300 bg-violet-50/60">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-violet-900">
        <FlaskConical className="size-4" aria-hidden />
        Demo controls — act as our team
      </summary>
      <div className="px-4 pb-4">
        <p className="text-xs leading-relaxed text-violet-900/80">
          These stand in for the staff CRM so you can walk the whole flow. There is no "confirm" button: a booking
          confirms itself once the quote is accepted, contract signed, advance paid and the artist's team has accepted.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {visible.map(({ action, label, needsNote }) => (
            <button
              key={action}
              type="button"
              disabled={run.isPending}
              onClick={() => (needsNote ? setNoteFor(action) : run.mutate({ action }))}
              className="rounded-md border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
        {noteFor && (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run.mutate({ action: noteFor, note }, { onSuccess: () => { setNoteFor(null); setNote(""); } });
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              placeholder={ACTIONS.find((a) => a.action === noteFor)?.needsNote}
              className="min-w-0 flex-1 rounded-md border border-violet-300 bg-white px-3 py-2 text-xs outline-none"
            />
            <button type="submit" className="rounded-md bg-violet-700 px-3 py-2 text-xs font-semibold text-white">
              Save
            </button>
            <button type="button" onClick={() => setNoteFor(null)} className="px-2 text-xs text-violet-900">
              Cancel
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
