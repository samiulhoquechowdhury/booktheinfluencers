"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import type { LineItemType } from "@repo/schemas";
import { api, errorMessage, quoteChecks, seesFinance, type QuoteDraft, type QuoteDraftLine, type QuoteRate, type StaffUser } from "@/lib/api";
import { inr, percent } from "@/lib/format";
import { useStaffMutation } from "@/lib/hooks";
import { Loading, inputClass } from "@/components/ui";

const TYPES: { value: LineItemType; label: string }[] = [
  { value: "TALENT_FEE", label: "Artist fee" },
  { value: "TRAVEL", label: "Travel" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "LOCAL_TRANSPORT", label: "Local transport" },
  { value: "SECURITY", label: "Security" },
  { value: "PRODUCTION", label: "Production" },
  { value: "SERVICE_FEE", label: "Service fee" },
  { value: "OTHER", label: "Other" },
];
const GST = [0, 500, 1200, 1800, 2800];

const toRupees = (paise: string) => (paise ? String(BigInt(paise) / 100n) : "");
const toPaise = (rupees: string) => String(BigInt(rupees.replace(/\D/g, "") || "0") * 100n);

/** QUO-1…6: itemised quote with live totals and the approval rules. */
export function QuoteBuilder({ bookingId, staff, onDone }: { bookingId: string; staff: StaffUser; onDone: () => void }) {
  const draft = useQuery({ queryKey: ["quote-draft", bookingId], queryFn: () => api.quotes.draft(bookingId), staleTime: Infinity });
  if (draft.isPending) return <Loading label="Preparing draft from the rate card" />;
  if (draft.error) return <p role="alert" className="text-sm text-rose-700">{errorMessage(draft.error)}</p>;
  return <Editor initial={draft.data} bookingId={bookingId} staff={staff} onDone={onDone} />;
}

function Editor({ initial, bookingId, staff, onDone }: { initial: QuoteDraft & { rate: QuoteRate }; bookingId: string; staff: StaffUser; onDone: () => void }) {
  const [lines, setLines] = useState<QuoteDraftLine[]>(initial.lines);
  const [validDays, setValidDays] = useState(initial.validDays);
  const [advanceBps, setAdvanceBps] = useState(initial.advanceBps);
  const finance = seesFinance(staff);
  const checks = quoteChecks(lines, initial.rate);
  const create = useStaffMutation(
    (draft: QuoteDraft) => api.quotes.create(bookingId, draft),
    checks.needsApproval ? "Quote sent to a super admin for approval" : "Quote sent to the customer",
  );

  const update = (index: number, patch: Partial<QuoteDraftLine>) => setLines((all) => all.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ lines, validDays, advanceBps }, { onSuccess: onDone });
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium">Customer ₹</th>
              <th className="pb-2 font-medium">Our cost ₹</th>
              <th className="pb-2 font-medium">GST</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="align-top">
                <td className="pb-2 pr-2">
                  <select value={line.type} onChange={(e) => update(index, { type: e.target.value as LineItemType })} aria-label="Line type" className={inputClass}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td className="pb-2 pr-2">
                  <input value={line.description} onChange={(e) => update(index, { description: e.target.value })} aria-label="Description" className={inputClass} />
                </td>
                <td className="pb-2 pr-2">
                  <input inputMode="numeric" value={toRupees(line.customerAmountPaise)} onChange={(e) => update(index, { customerAmountPaise: toPaise(e.target.value) })} aria-label="Customer amount in rupees" className={`${inputClass} w-32`} />
                </td>
                <td className="pb-2 pr-2">
                  <input inputMode="numeric" value={toRupees(line.internalCostPaise)} onChange={(e) => update(index, { internalCostPaise: toPaise(e.target.value) })} aria-label="Internal cost in rupees" className={`${inputClass} w-32`} />
                </td>
                <td className="pb-2 pr-2">
                  <select value={line.taxRateBps} onChange={(e) => update(index, { taxRateBps: Number(e.target.value) })} aria-label="GST rate" className={`${inputClass} w-24`}>
                    {GST.map((bps) => <option key={bps} value={bps}>{percent(bps)}</option>)}
                  </select>
                </td>
                <td className="pb-2">
                  <button type="button" onClick={() => setLines((all) => all.filter((_, i) => i !== index))} aria-label="Remove line" className="grid size-9 place-items-center rounded-md text-muted hover:bg-cream hover:text-rose-700">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => setLines((all) => [...all, { type: "OTHER", description: "", customerAmountPaise: "0", internalCostPaise: "0", taxRateBps: 1800 }])}
        className="btn btn-outline btn-sm"
      >
        <Plus aria-hidden />
        Add line
      </button>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Valid for (days)
          <input type="number" min={1} max={30} value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium text-ink">
          Advance
          <select value={advanceBps} onChange={(e) => setAdvanceBps(Number(e.target.value))} className={`${inputClass} mt-1`}>
            {[2500, 3000, 4000, 5000, 6000, 7500, 10000].map((bps) => (
              <option key={bps} value={bps}>{bps === 10000 ? "100% up front" : `${percent(bps)} advance, ${percent(10000 - bps)} balance`}</option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid gap-2 rounded-lg bg-cream-soft p-4 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">Subtotal</dt><dd className="font-semibold">{inr(checks.subtotalPaise)}</dd></div>
        <div><dt className="text-xs text-muted">GST</dt><dd className="font-semibold">{inr(checks.taxPaise)}</dd></div>
        <div><dt className="text-xs text-muted">Customer total</dt><dd className="font-semibold">{inr(checks.totalPaise)}</dd></div>
        <div>
          <dt className="text-xs text-muted">{finance ? "Margin" : "Rate card"}</dt>
          <dd className="font-semibold">
            {finance ? `${inr(checks.marginPaise)} (${percent(checks.marginBps)})` : `Standard ${inr(checks.sellingRatePaise)}`}
          </dd>
        </div>
      </dl>

      {checks.needsApproval ? (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Needs super admin approval before the customer sees it</p>
            <ul className="mt-1 list-disc pl-4">{checks.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" aria-hidden />
          Within the rate card and margin rules — goes straight to the customer.
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={create.isPending} className="btn btn-gold btn-sm disabled:opacity-60">
          {create.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {checks.needsApproval ? "Send for approval" : "Send quote"}
        </button>
        <button type="button" onClick={onDone} className="btn btn-outline btn-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
