"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@repo/utils";
import type { TalentApplicationRec } from "@repo/mock/types";
import { api, can, errorMessage } from "@/lib/api";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Failure, Loading, PageHeader, Pill } from "@/components/ui";

const TABS = ["Contact requests", "Artist applications", "Newsletter"] as const;
const APP_STATUS: Record<TalentApplicationRec["status"], { label: string; tone: "info" | "action" | "success" | "neutral" }> = {
  NEW: { label: "New", tone: "action" },
  REVIEWING: { label: "Reviewing", tone: "info" },
  INVITED: { label: "Invited", tone: "success" },
  DECLINED: { label: "Declined", tone: "neutral" },
};

export default function InboxPage() {
  const { data: staff } = useStaffSession();
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.inbox, queryFn: api.inbox.get });
  const [tab, setTab] = useState<(typeof TABS)[number]>("Contact requests");
  const setStatus = useStaffMutation(({ id, status }: { id: string; status: TalentApplicationRec["status"] }) => api.inbox.setApplication(id, status), "Application updated");
  if (isPending || !staff) return <Loading />;
  if (error) return <Failure message={errorMessage(error)} onRetry={() => refetch()} />;

  const counts = { "Contact requests": data.contactRequests.length, "Artist applications": data.applications.length, Newsletter: data.newsletter.length };

  return (
    <div className="space-y-5">
      <PageHeader title="Inbox" description="Everything that came in from the public site outside of booking briefs." />
      <div role="tablist" aria-label="Inbox" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-ink text-white" : "bg-white text-muted hover:text-ink"}`}>
            {t} ({counts[t]})
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-3">
        {tab === "Contact requests" &&
          (data.contactRequests.length === 0 ? (
            <Empty text="No contact requests yet. They come from the website's Contact page." />
          ) : (
            data.contactRequests.map((r) => (
              <article key={r.id} className="rounded-xl border border-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{r.name} · <span className="font-normal text-muted">{r.topic}</span></p>
                  <span className="text-xs text-muted">{r.ref} · {formatDateTime(r.at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-ink-soft">{r.message}</p>
                <p className="mt-3 flex flex-wrap gap-4">
                  <a href={`tel:+91${r.phone}`} className="text-gold-deep hover:underline">+91 {r.phone}</a>
                  {r.email && <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: your message ${r.ref}`)}`} className="text-gold-deep hover:underline">{r.email}</a>}
                </p>
              </article>
            ))
          ))}

        {tab === "Artist applications" &&
          (data.applications.length === 0 ? (
            <Empty text="No applications yet. Artists apply from For artists → Apply now." />
          ) : (
            data.applications.map((a) => (
              <article key={a.id} className="rounded-xl border border-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{a.stageName} · <span className="font-normal text-muted">{a.category}, {a.city}</span></p>
                  <span className="flex items-center gap-2 text-xs text-muted">{a.ref} · {formatDateTime(a.at)} <Pill tone={APP_STATUS[a.status].tone}>{APP_STATUS[a.status].label}</Pill></span>
                </div>
                <p className="mt-1 text-muted">{a.representation}</p>
                <p className="mt-2 whitespace-pre-wrap text-ink-soft">{a.about}</p>
                <p className="mt-2 whitespace-pre-wrap break-all text-xs text-muted">{a.links}</p>
                <p className="mt-3 flex flex-wrap gap-4">
                  <a href={`tel:+91${a.phone}`} className="text-gold-deep hover:underline">+91 {a.phone}</a>
                  <a href={`mailto:${a.email}`} className="text-gold-deep hover:underline">{a.email}</a>
                </p>
                {can(staff, "TALENT_MANAGER") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["REVIEWING", "INVITED", "DECLINED"] as const)
                      .filter((s) => s !== a.status)
                      .map((s) => (
                        <button key={s} type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: a.id, status: s })} className="btn btn-outline btn-sm">
                          {s === "REVIEWING" ? "Start review" : s === "INVITED" ? "Mark invited" : "Decline"}
                        </button>
                      ))}
                  </div>
                )}
              </article>
            ))
          ))}

        {tab === "Newsletter" &&
          (data.newsletter.length === 0 ? (
            <Empty text="No subscribers yet. People sign up from the website footer." />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-white text-sm">
              {data.newsletter.map((n) => (
                <li key={n.email} className="flex justify-between px-4 py-3">
                  <a href={`mailto:${n.email}`} className="text-ink hover:text-gold-deep">{n.email}</a>
                  <span className="text-xs text-muted">{formatDateTime(n.at)}</span>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">{text}</p>;
}
