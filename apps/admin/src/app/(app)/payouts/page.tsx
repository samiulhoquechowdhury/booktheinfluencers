"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { inr, istDate } from "@/lib/format";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill } from "@/components/ui";

/** SET-1/2: payouts are created at completion; Accounts marks them paid. */
export default function PayoutsPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.payouts, queryFn: api.payouts.list });
  const pay = useStaffMutation((bookingId: string) => api.bookings.action(bookingId, "markPayoutPaid"), "Payout marked paid");
  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Payouts" description="Amounts owed to artists and their representatives after completed events." />
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>{["Booking", "Artist", "Paid to", "Event", "Amount", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3"><Link href={`/leads/${p.leadId}`} className="font-semibold text-gold-deep hover:underline">{p.ref}</Link></td>
                <td className="px-4 py-3">{p.talent}</td>
                <td className="px-4 py-3">{p.repName}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(istDate(p.eventDate))}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium">{inr(p.amountPaise)}</td>
                <td className="px-4 py-3">
                  <Pill tone={p.status === "PAID" ? "success" : "action"}>{p.status === "PAID" ? "Paid" : "Pending"}</Pill>
                  {p.paidAt && <p className="mt-1 text-xs text-muted">{formatDate(p.paidAt)}</p>}
                </td>
                <td className="px-4 py-3">
                  {p.status !== "PAID" && (
                    <button type="button" disabled={pay.isPending} onClick={() => pay.mutate(p.bookingId)} className="btn btn-outline btn-sm">Mark paid</button>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No payouts yet. They appear when Ops marks an event completed.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
