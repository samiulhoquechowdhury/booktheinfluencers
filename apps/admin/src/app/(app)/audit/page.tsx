"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { KeyRound, LogIn, LogOut, ShieldAlert, Users } from "lucide-react";
import type { LoginEventRecord } from "@repo/schemas";
import { formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import type { Tone } from "@/lib/format";
import { keys } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

/** AUD-3: read-only, super admins only. Two tabs: staff changes, and sign-in history for everyone. */
export default function AuditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Audit />
    </Suspense>
  );
}

function Audit() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") === "sign-ins" ? "sign-ins" : "changes";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description={tab === "changes" ? "Every staff change to leads, bookings, quotes, payments, payouts, talents, staff and the website. Read-only." : "Who signed in, when, from where — staff, customers and artists. Kept for 180 days."}
      />
      <div role="tablist" aria-label="Audit log" className="flex gap-1">
        {(
          [
            ["changes", "Changes"],
            ["sign-ins", "Sign-ins"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => set({ tab: id === "changes" ? "" : id, q: "", who: "", what: "" })}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === id ? "bg-ink text-white" : "bg-white text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "changes" ? <Changes /> : <SignIns params={params} set={set} />}
    </div>
  );
}

function Changes() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.audit, queryFn: api.audit });
  const [q, setQ] = useState("");
  if (isPending) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;
  const rows = data.filter((r) => `${r.actorName} ${r.action} ${r.entityId} ${r.summary}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
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
    </>
  );
}

const AUDIENCES = [
  ["", "Everyone"],
  ["staff", "Staff"],
  ["customer", "Customers"],
  ["talent", "Artists"],
] as const;

const EVENTS = [
  ["", "All events"],
  ["sign_in", "Signed in"],
  ["sign_in_failed", "Failed attempts"],
  ["sign_out", "Signed out"],
  ["password_changed", "Password changes"],
] as const;

const EVENT_STYLE: Record<LoginEventRecord["event"], { label: string; tone: Tone; icon: typeof LogIn }> = {
  sign_in: { label: "Signed in", tone: "success", icon: LogIn },
  sign_in_failed: { label: "Failed", tone: "danger", icon: ShieldAlert },
  sign_out: { label: "Signed out", tone: "neutral", icon: LogOut },
  password_changed: { label: "Password changed", tone: "info", icon: KeyRound },
};

const AUDIENCE_LABEL: Record<LoginEventRecord["audience"], string> = { staff: "Staff", customer: "Customer", talent: "Artist" };

/** "Firefox on Linux", "Chrome on Android", "Safari on iPhone" — enough to spot an unfamiliar device. */
function device(ua: string | null) {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function SignIns({ params, set }: { params: URLSearchParams; set: (patch: Record<string, string>) => void }) {
  const filters = { audience: params.get("who") ?? "", event: params.get("what") ?? "", q: params.get("q") ?? "" };
  const [q, setQ] = useState(filters.q);
  const history = useInfiniteQuery({
    queryKey: [...keys.audit, "sign-ins", filters],
    queryFn: ({ pageParam }) => api.staff.signIns({ ...filters, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    refetchInterval: 30_000,
  });

  if (history.isPending) return <Loading />;
  if (history.error) return <Failure message={errorMessage(history.error)} onRetry={() => history.refetch()} />;
  const events = history.data.pages.flatMap((p) => p.events);
  const stats = history.data.pages[0]!.last24h;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={LogIn} label="Sign-ins, last 24 hours" value={stats.signIns} />
        <Stat icon={Users} label="People signed in, last 24 hours" value={stats.people} />
        <Stat icon={ShieldAlert} label="Failed attempts, last 24 hours" value={stats.failed} warn={stats.failed > 0} onClick={stats.failed > 0 ? () => set({ what: "sign_in_failed" }) : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="w-full sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() });
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== filters.q && set({ q: q.trim() })} placeholder="Name, email, phone or IP" aria-label="Search sign-ins" className={inputClass} />
        </form>
        <select value={filters.audience} onChange={(e) => set({ who: e.target.value })} aria-label="Who" className={`${inputClass} sm:w-44`}>
          {AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={filters.event} onChange={(e) => set({ what: e.target.value })} aria-label="Event" className={`${inputClass} sm:w-48`}>
          {EVENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {(filters.audience || filters.event || filters.q) && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              set({ who: "", what: "", q: "" });
            }}
            className="rounded-md px-2 py-1.5 text-sm text-muted hover:bg-cream hover:text-ink"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted">Updates every 30 seconds</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>{["When", "Who", "Event", "Details", "IP address", "Device"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const style = EVENT_STYLE[e.event];
              const Icon = style.icon;
              return (
                <tr key={e.id} className={`border-b border-line last:border-0 ${e.event === "sign_in_failed" ? "bg-rose-50/40" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(e.at)}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => { setQ(e.identifier); set({ q: e.identifier }); }} className="text-left hover:underline" title="Show only this person">
                      <span className="block font-medium text-ink">{e.userName ?? "Unknown"}</span>
                      <span className="block text-xs text-muted">
                        {AUDIENCE_LABEL[e.audience]} · {e.identifier}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={style.tone}>
                      <Icon className="size-3" aria-hidden />
                      {style.label}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{e.detail ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-soft">{e.ip ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft" title={e.userAgent ?? undefined}>{device(e.userAgent)}</td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No sign-ins match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {history.hasNextPage && (
        <button type="button" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage} className="btn btn-outline btn-sm disabled:opacity-50">
          {history.isFetchingNextPage ? "Loading…" : "Load older"}
        </button>
      )}
    </>
  );
}

function Stat({ icon: Icon, label, value, warn = false, onClick }: { icon: typeof LogIn; label: string; value: number; warn?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className={`grid size-9 place-items-center rounded-full ${warn ? "bg-rose-100 text-rose-700" : "bg-cream text-gold-deep"}`}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span>
        <span className={`block text-2xl font-semibold ${warn ? "text-rose-700" : "text-ink"}`}>{value}</span>
        <span className="block text-xs text-muted">{label}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl border border-rose-200 bg-white p-4 text-left hover:bg-rose-50" title="Show failed attempts">
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-4">{body}</div>
  );
}
