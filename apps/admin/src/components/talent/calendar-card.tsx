"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import { toast } from "sonner";
import type { CalendarEntry } from "@repo/schemas";
import { toIstDateKey } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Card, Failure, Loading, inputClass } from "@/components/ui";

// AVL-4 / TAL-3: the artist's calendar as the talent team sees it. Click a free date to block it,
// click a date the team set to clear it. Confirmed bookings hold their date until cancelled.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const readable = (date: string) => dayLabel.format(new Date(`${date}T00:00:00Z`));

const STYLE: Record<CalendarEntry["source"], string> = {
  manager: "bg-ink text-white hover:bg-ink-soft",
  artist: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300 hover:bg-amber-200",
  booking: "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300",
};
const SOURCE_LABEL: Record<CalendarEntry["source"], string> = { manager: "Talent team", artist: "Artist", booking: "Booking" };

export function CalendarCard({ slug, manage }: { slug: string; manage: boolean }) {
  const calendar = useQuery({ queryKey: keys.blackouts(slug), queryFn: () => api.talents.blackouts(slug) });
  const today = toIstDateKey(new Date());
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [note, setNote] = useState("");
  const toggle = useStaffMutation(
    async ({ date, on, label }: { date: string; on: boolean; label: string }) => {
      await api.talents.setBlackout(slug, date, on, on ? note.trim() || undefined : undefined);
      toast.success(on ? `Blocked ${label}` : `Cleared ${label}`);
    },
  );
  const selfEdit = useStaffMutation((value: boolean) => api.talents.setSelfEdit(slug, value), "Calendar access updated");

  const days = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first
    const count = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    return [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [cursor]);

  if (calendar.isPending) return <Card title="Calendar"><Loading /></Card>;
  if (calendar.error) return <Card title="Calendar"><Failure message={errorMessage(calendar.error)} onRetry={() => calendar.refetch()} /></Card>;

  const byDate = new Map(calendar.data.entries.map((e) => [e.date, e]));
  const upcoming = calendar.data.entries.filter((e) => e.date >= today);
  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(Date.UTC(year, month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  const atCurrentMonth = key(cursor.year, cursor.month, 1) <= key(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1);

  function click(date: string, entry: CalendarEntry | undefined) {
    if (entry?.source === "booking") return;
    toggle.mutate(
      { date, on: !entry, label: readable(date) },
      {
        onSuccess: () => {
          if (!entry) setNote("");
        },
      },
    );
  }

  return (
    <Card
      title="Calendar"
      actions={
        <span className="text-xs text-muted">
          {upcoming.length === 0 ? "No dates blocked" : `${upcoming.length} upcoming ${upcoming.length === 1 ? "date" : "dates"}`}
        </span>
      }
    >
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={atCurrentMonth} aria-label="Previous month" className="grid size-9 place-items-center rounded-md hover:bg-cream disabled:opacity-30">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink" aria-live="polite">
            {monthLabel.format(new Date(Date.UTC(cursor.year, cursor.month, 15)))}
          </h3>
          {!atCurrentMonth && (
            <button type="button" onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })} className="text-xs font-medium text-gold-deep hover:underline">
              Today
            </button>
          )}
        </div>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid size-9 place-items-center rounded-md hover:bg-cream">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} aria-hidden className="py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            {d}
          </div>
        ))}
        {days.map((day, index) => {
          if (!day) return <div key={`pad-${index}`} />;
          const date = key(cursor.year, cursor.month, day);
          const entry = byDate.get(date);
          const past = date < today;
          const disabled = !manage || past || entry?.source === "booking" || toggle.isPending;
          const what = entry ? `${SOURCE_LABEL[entry.source]}${entry.note ? `: ${entry.note}` : ""}` : "Free";
          return (
            <button
              key={date}
              type="button"
              title={`${readable(date)} · ${what}${!disabled ? (entry ? " · click to clear" : " · click to block") : ""}`}
              aria-label={`${readable(date)}, ${what}`}
              aria-pressed={Boolean(entry)}
              disabled={disabled}
              onClick={() => click(date, entry)}
              className={`relative aspect-square rounded-md text-sm font-medium transition-colors disabled:cursor-default ${
                entry ? `${STYLE[entry.source]} ${past ? "opacity-40" : ""}` : past ? "text-line" : "text-ink hover:bg-cream"
              } ${date === today ? "ring-2 ring-gold" : ""}`}
            >
              {day}
              {entry?.source === "manager" && <Lock className="absolute right-1 top-1 size-2.5 opacity-70" aria-hidden />}
              {entry?.source === "booking" && <CalendarCheck className="absolute right-1 top-1 size-2.5" aria-hidden />}
            </button>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        <Legend className="bg-ink" label="Blocked by the talent team" />
        <Legend className="bg-amber-100 ring-1 ring-amber-300" label="Blocked by the artist" />
        <Legend className="bg-emerald-100 ring-1 ring-emerald-300" label="Confirmed booking" />
      </ul>

      {manage && (
        <label className="mt-4 block space-y-1.5">
          <span className="text-xs font-semibold text-ink-soft">Reason for the next date you block (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Touring abroad" className={inputClass} />
        </label>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing blocked. The artist shows up in every date search.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {upcoming.slice(0, 12).map((e) => (
              <li key={e.date} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{readable(e.date)}</p>
                  <p className="truncate text-xs text-muted">
                    {SOURCE_LABEL[e.source]}
                    {e.source === "booking" && e.leadId ? (
                      <>
                        {" · "}
                        <Link href={`/leads/${e.leadId}`} className="font-medium text-gold-deep hover:underline">
                          {e.ref}
                        </Link>
                      </>
                    ) : (
                      e.note && ` · ${e.note}`
                    )}
                  </p>
                </div>
                {manage && e.source !== "booking" && (
                  <button
                    type="button"
                    onClick={() => toggle.mutate({ date: e.date, on: false, label: readable(e.date) })}
                    disabled={toggle.isPending}
                    aria-label={`Clear ${readable(e.date)}`}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-rose-50 hover:text-rose-700"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {upcoming.length > 12 && <p className="mt-2 text-xs text-muted">And {upcoming.length - 12} more — use the calendar above.</p>}
      </div>

      <div className="mt-5 flex items-start justify-between gap-4 border-t border-line pt-4">
        <div>
          <p className="text-sm font-semibold text-ink">Artist can edit their calendar</p>
          <p className="text-xs text-muted">
            {calendar.data.selfEdit ? "They can block and clear their own dates from the talent portal. Dates set here stay locked." : "Only the talent team can change dates. The artist sees them read-only."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={calendar.data.selfEdit}
          aria-label="Artist can edit their calendar"
          disabled={!manage || selfEdit.isPending}
          onClick={() => selfEdit.mutate(!calendar.data.selfEdit)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${calendar.data.selfEdit ? "bg-emerald-600" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${calendar.data.selfEdit ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">Blocked dates hide the artist from date searches and stop new enquiries for that day.</p>
    </Card>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`size-3 rounded-sm ${className}`} />
      {label}
    </li>
  );
}
