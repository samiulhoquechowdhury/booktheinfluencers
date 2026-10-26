"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { toast } from "sonner";
import { toIstDateKey } from "@repo/utils";
import { api, errorMessage } from "@/lib/api/client";
import { keys, useBlackouts, useTalentBookings } from "@/lib/api/hooks";
import { ErrorState, Spinner } from "@/components/ui/feedback";
import { PortalShell } from "./portal-shell";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function BlackoutCalendar() {
  return <PortalShell>{() => <Calendar />}</PortalShell>;
}

/** TAL-3 / AVL-4: dates the artist can't take. Blocking a date hides them from search for that day. */
function Calendar() {
  const client = useQueryClient();
  const blackouts = useBlackouts();
  const bookings = useTalentBookings();
  const today = toIstDateKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y!, month: m! - 1 };
  });

  const toggle = useMutation({
    mutationFn: ({ date, on }: { date: string; on: boolean }) => api.talent.setBlackout(date, on),
    onSuccess: (_r, { on }) => {
      void client.invalidateQueries({ queryKey: keys.blackouts });
      toast.success(on ? "Date blocked" : "Date unblocked");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const days = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first
    const count = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    return [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [cursor]);

  if (blackouts.isPending || bookings.isPending) return <Spinner />;
  if (blackouts.error) return <ErrorState message={errorMessage(blackouts.error)} />;

  const entries = new Map(blackouts.data.entries.map((e) => [e.date, e]));
  const canEdit = blackouts.data.selfEdit;
  const blocked = new Set(blackouts.data.entries.filter((e) => e.source !== "booking").map((e) => e.date));
  const locked = new Set(blackouts.data.entries.filter((e) => e.source === "manager").map((e) => e.date));
  // Confirmed bookings hold their date; open requests show too so the artist doesn't block over them.
  const booked = new Set([
    ...blackouts.data.entries.filter((e) => e.source === "booking").map((e) => e.date),
    ...(bookings.data ?? []).filter((b) => !b.cancelledAt && b.availability !== "UNAVAILABLE").map((b) => b.eventDate),
  ]);
  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(Date.UTC(year, month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="rounded-card border border-line bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="grid size-10 place-items-center rounded-md hover:bg-cream">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <h2 className="font-serif text-xl font-semibold text-ink" aria-live="polite">
            {monthLabel.format(new Date(Date.UTC(cursor.year, cursor.month, 15)))}
          </h2>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid size-10 place-items-center rounded-md hover:bg-cream">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((d) => (
            <div key={d} aria-hidden className="py-2 text-xs font-medium text-muted">
              {d}
            </div>
          ))}
          {days.map((day, index) => {
            if (!day) return <div key={`pad-${index}`} />;
            const date = key(cursor.year, cursor.month, day);
            const past = date < today;
            const isBlocked = blocked.has(date);
            const isBooked = booked.has(date);
            const isLocked = locked.has(date);
            const note = entries.get(date)?.note;
            const label = `${day} ${monthLabel.format(new Date(Date.UTC(cursor.year, cursor.month, 15)))}${isBooked ? ", booking" : ""}${isBlocked ? ", blocked" : ""}${isLocked ? " by your manager" : ""}${note ? ` (${note})` : ""}`;
            return (
              <button
                key={date}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={isBlocked}
                disabled={!canEdit || past || isBooked || isLocked || toggle.isPending}
                onClick={() => toggle.mutate({ date, on: !isBlocked })}
                className={`relative aspect-square rounded-lg text-sm font-medium transition-colors disabled:cursor-default ${
                  isBooked
                    ? "bg-emerald-100 text-emerald-900"
                    : isBlocked
                      ? "bg-ink text-white hover:bg-ink-soft"
                      : past
                        ? "text-line"
                        : "text-ink hover:bg-cream"
                } ${date === today ? "ring-2 ring-gold" : ""}`}
              >
                {day}
                {isLocked && <Lock className="absolute right-1 top-1 size-3" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="space-y-4 text-sm">
        <div className="rounded-card border border-line bg-white p-5">
          <h2 className="font-display font-semibold text-ink">How it works</h2>
          <p className="mt-2 leading-relaxed text-muted">
            {canEdit
              ? "Tap a date to block it. Clients searching for that date won't see you, and no new requests come in for it. Tap again to unblock."
              : "Your manager looks after your calendar. Ask them to block or free a date."}
          </p>
          <ul className="mt-4 space-y-2">
            <Legend className="bg-ink" label="Blocked by you" />
            <Legend className="bg-ink" label="Set by your manager" lock />
            <Legend className="bg-emerald-100" label="Booking on this date" />
          </ul>
        </div>
        <p className="px-1 text-xs leading-relaxed text-muted">
          Blocking a date doesn't affect bookings already confirmed. Talk to your manager if you need to change one.
        </p>
      </aside>
    </div>
  );
}

function Legend({ className, label, lock = false }: { className: string; label: string; lock?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 text-muted">
      <span className={`relative size-5 rounded ${className}`}>
        {lock && <Lock className="absolute right-0.5 top-0.5 size-2.5 text-white" aria-hidden />}
      </span>
      {label}
    </li>
  );
}
