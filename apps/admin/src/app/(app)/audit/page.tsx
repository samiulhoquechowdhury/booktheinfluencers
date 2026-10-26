"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { keys } from "@/lib/hooks";
import { Failure, Loading, PageHeader, inputClass } from "@/components/ui";

/** AUD-3: read-only, super admins only. */
export default function AuditPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.audit, queryFn: api.audit });
  const [q, setQ] = useState("");
  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;
  const rows = data.filter((r) => `${r.actorName} ${r.action} ${r.entityId} ${r.summary}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <PageHeader title="Audit log" description="Every staff change to leads, bookings, quotes, payments, payouts and talent calendars. Read-only." />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by person, action or reference" aria-label="Filter audit log" className={`${inputClass} max-w-sm`} />
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>{["When", "Who", "Action", "Record", "Details"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(r.at)}</td>
                <td className="px-4 py-3">{r.actorName}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-3">{r.entity} {r.entityId}</td>
                <td className="px-4 py-3 text-ink-soft">{r.summary}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">{data.length ? "No entries match." : "No staff changes recorded yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
