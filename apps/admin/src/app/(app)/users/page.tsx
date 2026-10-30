"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { AccountStatus, UserFilters, UserRow } from "@repo/schemas";
import { formatDate, formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { ACCOUNT_LABELS, accountTone } from "@/lib/format";
import { keys } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

const accountType = (u: Pick<UserRow, "isCustomer" | "isArtist">) => [u.isCustomer && "Customer", u.isArtist && "Artist"].filter(Boolean).join(" & ") || "User";

export default function UsersPage() {
  const [filters, setFilters] = useState<UserFilters>({ page: 1 });
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: [...keys.users, filters], queryFn: () => api.users.list(filters), placeholderData: keepPreviousData });
  const set = (change: UserFilters) => setFilters((f) => ({ ...f, ...change, page: change.page ?? 1 }));

  if (list.isPending) return <Loading />;
  if (list.error) return <Failure message={errorMessage(list.error)} onRetry={() => list.refetch()} />;
  const { rows, total, page, pageCount, counts } = list.data;
  const tabs: { status?: AccountStatus; label: string; count: number }[] = [
    { label: "All", count: counts.all },
    { status: "ACTIVE", label: "Active", count: counts.active },
    { status: "DEACTIVATED", label: "Deactivated", count: counts.deactivated },
    { status: "BLOCKED", label: "Blocked", count: counts.blocked },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Users" description="Everyone who has signed in on the website. Open someone to see their details, or to deactivate or block their account." />

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative w-full sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, mobile or email" aria-label="Search users" className={`${inputClass} pl-9`} />
        </form>
        <div className="w-full sm:w-56">
          <select value={filters.type ?? ""} onChange={(e) => set({ type: (e.target.value || undefined) as UserFilters["type"] })} aria-label="Account type" className={inputClass}>
            <option value="">Customers and artists</option>
            <option value="customer">Customers</option>
            <option value="artist">Artists</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const on = filters.status === tab.status;
          return (
            <button key={tab.label} type="button" aria-pressed={on} onClick={() => set({ status: tab.status })} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}>
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">No users match this.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>{["Name", "Mobile", "Type", "Status", "Enquiries", "Last sign-in", "Joined"].map((h) => <th key={h} className="px-3 py-3 font-medium first:pl-4 last:pr-4">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-cream-soft">
                  <td className="py-3 pl-4 pr-3">
                    <Link href={`/users/${u.id}`} className="font-medium text-ink underline-offset-2 hover:text-gold-deep hover:underline">{u.name}</Link>
                    {u.email && <span className="block text-xs text-muted">{u.email}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-soft">{u.phone ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-soft">{accountType(u)}</td>
                  <td className="px-3 py-3"><Pill tone={accountTone(u.status)}>{ACCOUNT_LABELS[u.status]}</Pill></td>
                  <td className="px-3 py-3 text-ink-soft">{u.enquiryCount}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Not recorded"}</td>
                  <td className="whitespace-nowrap py-3 pl-3 pr-4 text-muted">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <span>{total} users · page {page} of {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => set({ page: page - 1 })} className="btn btn-outline btn-sm disabled:opacity-50">Previous</button>
            <button type="button" disabled={page >= pageCount} onClick={() => set({ page: page + 1 })} className="btn btn-outline btn-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
