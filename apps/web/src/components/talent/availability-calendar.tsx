"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toIstDateKey } from "@repo/utils";
import { blockedDatesQuery } from "@/lib/api/hooks";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** AVL-4: the dates an artist can't take, set by them or our team. A free date still needs confirming with their team. */
export function AvailabilityCalendar({ slug }: { slug: string }) {
  const today = useMemo(() => toIstDateKey(new Date()), []);
  const [cursor, setCursor] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 });
  const { data, isPending, error } = useQuery(blockedDatesQuery(slug));
  const blocked = useMemo(() => new Set(data ?? []), [data]);

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(Date.UTC(year, month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const blanks = (first.getUTCDay() + 6) % 7; // Monday-first
  const count = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const month = monthLabel.format(first);
  const atStart = key(cursor.year, cursor.month, 1) <= `${today.slice(0, 7)}-01`;

  return (
    <section aria-labelledby="availability-heading">
      <h2 id="availability-heading" className="font-serif text-2xl font-semibold text-ink">Availability</h2>
      <div className="mt-4 rounded-card border border-line bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} disabled={atStart} aria-label="Previous month" className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-cream disabled:invisible">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p aria-live="polite" className="font-display text-sm font-semibold text-ink">{month}</p>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-cream">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((day, i) => <span key={i} aria-hidden className="text-xs font-medium text-muted">{day}</span>)}
          {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const day = i + 1;
            const date = key(cursor.year, cursor.month, day);
            const past = date < today;
            const taken = blocked.has(date);
            return (
              <span
                key={date}
                role="img"
                aria-label={`${day} ${month}${taken ? ", not available" : past ? ", past" : ""}`}
                title={taken ? "Not available" : undefined}
                className={`grid aspect-square place-items-center rounded-md text-sm ${taken ? "bg-rose-50 font-medium text-rose-700 line-through" : past ? "text-muted/50" : "text-ink"}`}
              >
                {day}
              </span>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span aria-hidden className="size-3 rounded bg-rose-50 ring-1 ring-inset ring-rose-200" />
          Not available
        </p>
        <p className="mt-1 text-xs text-muted">
          {error ? "We couldn't load the calendar just now." : isPending ? "Loading dates…" : "Other dates aren't guaranteed. We confirm with the artist's team after you send your brief."}
        </p>
      </div>
    </section>
  );
}
