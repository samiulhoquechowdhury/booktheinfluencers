"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, MessageSquareText, Printer } from "lucide-react";
import type { CustomerQuote, LineItemType } from "@repo/schemas";
import { formatDate, formatDateTime } from "@repo/utils";
import { api } from "@/lib/api/client";
import { useBookingMutation } from "@/lib/api/hooks";
import { inr } from "@/lib/format";
import { StatusPill } from "@/components/ui/status-pill";

const LINE_LABELS: Record<LineItemType, string> = {
  TALENT_FEE: "Artist fee",
  TRAVEL: "Travel",
  ACCOMMODATION: "Accommodation",
  LOCAL_TRANSPORT: "Local transport",
  SECURITY: "Security",
  PRODUCTION: "Production",
  SERVICE_FEE: "Service fee",
  OTHER: "Other",
};

export const percent = (bps: number) => `${bps / 100}%`;

export function QuoteTable({ quote }: { quote: CustomerQuote }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Quote version {quote.version} line items</caption>
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
          <th scope="col" className="py-2 font-medium">
            Item
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            GST
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {quote.lineItems.map((line, index) => (
          <tr key={index} className="border-b border-line/70">
            <td className="py-2.5 pr-3">
              <span className="block text-ink">{LINE_LABELS[line.type]}</span>
              <span className="text-xs text-muted">{line.description}</span>
            </td>
            <td className="py-2.5 text-right text-muted">{percent(line.taxRateBps)}</td>
            <td className="py-2.5 text-right font-display text-ink">{inr(line.customerAmountPaise)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={2} className="pt-3 text-right font-normal text-muted">
            Subtotal
          </th>
          <td className="pt-3 text-right font-display text-ink">{inr(quote.subtotalPaise)}</td>
        </tr>
        <tr>
          <th scope="row" colSpan={2} className="pt-1 text-right font-normal text-muted">
            GST
          </th>
          <td className="pt-1 text-right font-display text-ink">{inr(quote.taxPaise)}</td>
        </tr>
        <tr>
          <th scope="row" colSpan={2} className="pt-2 text-right font-display font-semibold text-ink">
            Total
          </th>
          <td className="pt-2 text-right font-serif text-xl font-semibold text-ink">{inr(quote.totalPaise)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function QuotePanel({ leadId, quotes, cancelled }: { leadId: string; quotes: CustomerQuote[]; cancelled: boolean }) {
  const current = quotes.find((q) => q.status === "SENT" || q.status === "ACCEPTED") ?? quotes[0];
  const older = quotes.filter((q) => q.id !== current?.id);
  const [mode, setMode] = useState<"idle" | "accept" | "changes">("idle");
  const [agreed, setAgreed] = useState(false);
  const [note, setNote] = useState("");

  const accept = useBookingMutation((id: string) => api.bookings.acceptQuote(id), {
    success: "Quote accepted. Next: sign the contract and pay the advance.",
  });
  const changes = useBookingMutation(({ id, text }: { id: string; text: string }) => api.bookings.requestChanges(id, text), {
    success: "Thanks — your manager will send a revised quote.",
  });

  if (!current) {
    return (
      <Panel icon={<FileText className="size-4" aria-hidden />} title="Quote">
        <p className="text-sm text-muted">Your itemised quote will appear here once the artist's date is confirmed.</p>
      </Panel>
    );
  }

  const expired = current.status === "EXPIRED" || (current.status === "SENT" && new Date(current.validUntil) < new Date());
  const open = current.status === "SENT" && !expired && !cancelled;

  return (
    <Panel
      icon={<FileText className="size-4" aria-hidden />}
      title={`Quote · version ${current.version}`}
      badge={
        current.status === "ACCEPTED" ? (
          <StatusPill tone="success">Accepted</StatusPill>
        ) : expired ? (
          <StatusPill tone="danger">Expired</StatusPill>
        ) : current.changeRequest ? (
          <StatusPill tone="info">Changes requested</StatusPill>
        ) : (
          <StatusPill tone="action">Awaiting your decision</StatusPill>
        )
      }
    >
      <QuoteTable quote={current} />

      <div className="mt-4 grid gap-3 rounded-xl bg-cream-soft p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Payment schedule</p>
          <ul className="mt-1 text-ink">
            {current.milestonePlan.map((part) => (
              <li key={part.label}>
                {part.label}: {percent(part.percentBps)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">
            {current.status === "ACCEPTED" ? "Accepted" : "Valid until"}
          </p>
          <p className="mt-1 text-ink">
            {current.status === "ACCEPTED" && current.acceptedAt ? formatDateTime(current.acceptedAt) : formatDate(current.validUntil)}
          </p>
        </div>
      </div>

      {current.changeRequest && current.status === "SENT" && (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          You asked: “{current.changeRequest}”. Your manager is preparing a revised quote.
        </p>
      )}
      {expired && (
        <p className="mt-3 text-sm text-rose-700">This quote has expired. Ask your manager for a fresh one.</p>
      )}

      {open && mode === "idle" && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => setMode("accept")} className="btn btn-gold">
            <CheckCircle2 aria-hidden />
            Accept quote
          </button>
          <button type="button" onClick={() => setMode("changes")} className="btn btn-outline">
            <MessageSquareText aria-hidden />
            Request changes
          </button>
        </div>
      )}

      {open && mode === "accept" && (
        <div className="mt-5 rounded-xl border border-line p-4">
          <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-ink-soft">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--gold-deep)]" />
            <span>
              I accept this quote of <strong className="text-ink">{inr(current.totalPaise)}</strong>, the payment schedule
              and the{" "}
              <Link href="/cancellation-policy" target="_blank" className="underline underline-offset-2">
                cancellation policy
              </Link>
              . The booking is confirmed only after the contract is signed and the advance is paid.
            </span>
          </label>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={!agreed || accept.isPending}
              onClick={() => accept.mutate(current.id, { onSuccess: () => setMode("idle") })}
              className="btn btn-gold disabled:opacity-50"
            >
              {accept.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Confirm acceptance
            </button>
            <button type="button" onClick={() => setMode("idle")} className="btn btn-outline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && mode === "changes" && (
        <form
          className="mt-5 rounded-xl border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            changes.mutate({ id: current.id, text: note }, { onSuccess: () => { setMode("idle"); setNote(""); } });
          }}
        >
          <label className="block text-sm font-medium text-ink">
            What would you like changed?
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              required
              placeholder="e.g. Can we do a 45-minute set instead? Travel is covered by our hotel."
              className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm font-normal outline-none focus:border-gold"
            />
          </label>
          <div className="mt-3 flex gap-3">
            <button type="submit" disabled={changes.isPending || !note.trim()} className="btn btn-dark disabled:opacity-50">
              {changes.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Send request
            </button>
            <button type="button" onClick={() => setMode("idle")} className="btn btn-outline">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Link href={`/account/bookings/${leadId}/quote/${current.id}`} className="flex items-center gap-1.5 font-medium text-gold-deep hover:underline">
          <Printer className="size-4" aria-hidden />
          Printable quote
        </Link>
        {older.length > 0 && (
          <details className="text-muted">
            <summary className="cursor-pointer hover:text-ink">Earlier versions ({older.length})</summary>
            <ul className="mt-2 space-y-1">
              {older.map((q) => (
                <li key={q.id}>
                  <Link href={`/account/bookings/${leadId}/quote/${q.id}`} className="hover:text-ink">
                    Version {q.version} · {inr(q.totalPaise)} · {q.status.toLowerCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  );
}

export function Panel({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-display font-semibold text-ink">
          <span className="text-gold-deep">{icon}</span>
          {title}
        </h4>
        {badge}
      </div>
      {children}
    </section>
  );
}
