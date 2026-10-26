"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@repo/utils";
import type { MilestoneStatus } from "@repo/schemas";
import { api, can, errorMessage } from "@/lib/api";
import { MILESTONE_LABELS, inr } from "@/lib/format";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

const FILTERS: { id: string; label: string; match: (s: MilestoneStatus) => boolean }[] = [
  { id: "open", label: "Outstanding", match: (s) => s === "PENDING" || s === "LINK_SENT" || s === "OVERDUE" },
  { id: "paid", label: "Paid", match: (s) => s === "PAID" },
  { id: "all", label: "All", match: () => true },
];

export default function PaymentsPage() {
  const { data: staff } = useStaffSession();
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.payments, queryFn: api.payments.list });
  const [filter, setFilter] = useState("open");
  const [utrFor, setUtrFor] = useState<string | null>(null);
  const [utr, setUtr] = useState("");
  const link = useStaffMutation((id: string) => api.payments.link(id), "Payment link sent");
  const manual = useStaffMutation(({ id, ref }: { id: string; ref: string }) => api.payments.manual(id, ref), "Payment recorded");

  if (isPending || !staff) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;

  const rows = data.filter((m) => FILTERS.find((f) => f.id === filter)!.match(m.status));
  const outstanding = data.filter((m) => FILTERS[0]!.match(m.status)).reduce((sum, m) => sum + BigInt(m.amountPaise), 0n);

  return (
    <div className="space-y-5">
      <PageHeader title="Payments" description={`Outstanding: ${inr(outstanding)}. Gateway payments update automatically; bank transfers are recorded here.`} />
      <div role="group" aria-label="Filter" className="flex gap-1">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`rounded-md px-3 py-1.5 text-sm ${filter === f.id ? "bg-ink text-white" : "bg-white text-muted hover:text-ink"}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>{["Booking", "Customer", "Artist", "Milestone", "Amount", "Due", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-3"><Link href={`/leads/${m.leadId}`} className="font-semibold text-gold-deep hover:underline">{m.ref}</Link></td>
                <td className="px-4 py-3">{m.customer}</td>
                <td className="px-4 py-3">{m.talent}</td>
                <td className="px-4 py-3">{m.label}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium">{inr(m.amountPaise)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(m.dueDate)}</td>
                <td className="px-4 py-3">
                  <Pill tone={m.status === "PAID" ? "success" : m.status === "CANCELLED" ? "neutral" : "action"}>{MILESTONE_LABELS[m.status]}</Pill>
                  {m.payment && <p className="mt-1 text-xs text-muted">{m.payment.method === "bank_transfer" ? "UTR" : "Ref"} {m.payment.gatewayPaymentId}</p>}
                </td>
                <td className="px-4 py-3">
                  {FILTERS[0]!.match(m.status) && (
                    <div className="flex flex-col items-start gap-2">
                      {(m.status === "PENDING" || m.status === "OVERDUE") && can(staff, "ACCOUNTS", "SALES") && (
                        <button type="button" onClick={() => link.mutate(m.id)} disabled={link.isPending} className="btn btn-outline btn-sm">Send link</button>
                      )}
                      {can(staff, "ACCOUNTS") &&
                        (utrFor === m.id ? (
                          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); manual.mutate({ id: m.id, ref: utr }, { onSuccess: () => { setUtrFor(null); setUtr(""); } }); }}>
                            <input value={utr} onChange={(e) => setUtr(e.target.value)} required placeholder="UTR" aria-label="Bank transfer reference" className={`${inputClass} w-32`} />
                            <button type="submit" className="btn btn-dark btn-sm">Save</button>
                          </form>
                        ) : (
                          <button type="button" onClick={() => setUtrFor(m.id)} className="btn btn-outline btn-sm">Record transfer</button>
                        ))}
                      {!m.isAdvance && !m.contractSigned && <span className="text-xs text-muted">Contract not signed yet</span>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
