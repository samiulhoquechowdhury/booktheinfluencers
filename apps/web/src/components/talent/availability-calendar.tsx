"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toIstDateKey } from "@repo/utils";
import { blockedDatesQuery } from "@/lib/api/hooks";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * AVL-4: which dates are taken, across one artist or a whole shortlist. Booked means another customer confirmed the
 * date; not available means the artist or our team blocked it. With `onPick`, free dates can be chosen.
 */
export function AvailabilityCalendar({ slugs, start, heading, onPick }: { slugs: string[]; start?: string; heading?: string; onPick?: (date: string) => void }) {
  const today = useMemo(() => toIstDateKey(new Date()), []);
  const opening = start ?? today;
  const [cursor, setCursor] = useState({ year: Number(opening.slice(0, 4)), month: Number(opening.slice(5, 7)) - 1 });
  const calendars = useQueries({ queries: slugs.map(blockedDatesQuery) });
  const taken = new Set(calendars.flatMap((c) => c.data?.dates ?? []));
  const booked = new Set(calendars.flatMap((c) => c.data?.booked ?? []));
  const isPending = calendars.some((c) => c.isPending);
  const failed = calendars.some((c) => c.error);

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
  const Title = heading ? "h3" : "h2";

  return (
    <section id={heading ? undefined : "availability"} aria-label={heading ?? "Availability"} className="scroll-mt-24">
      <Title className={heading ? "font-display text-sm font-semibold text-ink" : "font-serif text-2xl font-semibold text-ink"}>{heading ?? "Availability"}</Title>
      <div className={`${heading ? "mt-2" : "mt-4"} rounded-card border border-line bg-white p-4 sm:p-5`}>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} disabled={atStart} aria-label="Previous month" className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-cream disabled:invisible">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p aria-live="polite" className="font-display text-sm font-semibold text-ink">{month}</p>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-cream">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className={`mx-auto mt-3 grid grid-cols-7 gap-1 text-center ${heading ? "max-w-md" : ""}`}>
          {WEEKDAYS.map((day, i) => <span key={i} aria-hidden className="text-xs font-medium text-muted">{day}</span>)}
          {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const day = i + 1;
            const date = key(cursor.year, cursor.month, day);
            const isBooked = booked.has(date);
            const isTaken = taken.has(date);
            const past = date < today;
            const name = `${day} ${month}`;
            const cell = "grid aspect-square place-items-center rounded-md text-sm";
            if (onPick && !isTaken && !past) {
              return (
                <button key={date} type="button" onClick={() => onPick(date)} aria-label={`${name}, free. Choose this date`} className={`${cell} cursor-pointer bg-emerald-50 font-medium text-emerald-800 transition-colors hover:bg-emerald-600 hover:text-white`}>
                  {day}
                </button>
              );
            }
            const state = isBooked ? "booked" : isTaken ? "not available" : past ? "past" : null;
            return (
              <span
                key={date}
                role="img"
                aria-label={state ? `${name}, ${state}` : name}
                title={isBooked ? "Booked" : isTaken ? "Not available" : undefined}
                className={`${cell} ${isBooked ? "bg-rose-100 font-medium text-rose-800 line-through" : isTaken ? "bg-cream font-medium text-muted line-through" : past ? "text-muted/50" : "text-ink"}`}
              >
                {day}
              </span>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {onPick && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded bg-emerald-50 ring-1 ring-inset ring-emerald-200" />
              Free
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded bg-rose-100 ring-1 ring-inset ring-rose-200" />
            Booked
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded bg-cream ring-1 ring-inset ring-line" />
            Not available
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          {failed ? "We couldn't load the calendar just now." : isPending ? "Loading dates…" : "Free dates are confirmed with the artist's team after you send your brief."}
        </p>
      </div>
    </section>
  );
}
