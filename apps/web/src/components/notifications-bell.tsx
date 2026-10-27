"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { formatDateTime } from "@repo/utils";
import { api } from "@/lib/api/client";
import { keys, useNotifications } from "@/lib/api/hooks";

/** NOT-*: in-app notifications for booking updates and manager replies. */
export function NotificationsBell() {
  const client = useQueryClient();
  const { data } = useNotifications(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const markSeen = useMutation({
    mutationFn: api.notifications.markSeen,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.notifications }),
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  return (
    // On phones the panel is full width under the header: anchored to the bell it would run off the left edge.
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unread) markSeen.mutate();
        }}
        className="relative grid size-10 place-items-center rounded-md text-ink transition-colors hover:bg-cream"
      >
        <Bell className="size-[21px]" strokeWidth={1.75} aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-rose-600 px-1 text-[0.65rem] font-bold leading-[18px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-[4.5rem] z-50 overflow-hidden rounded-card border border-line bg-white shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[22rem]">
          <p className="border-b border-line px-4 py-3 font-display text-sm font-semibold text-ink">Notifications</p>
          {!data || data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Nothing yet. Updates on your bookings will show here.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {data.items.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-cream-soft">
                    <span className="block text-sm font-medium text-ink">{item.title}</span>
                    {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{item.body}</span>}
                    <span className="mt-1 block text-[0.7rem] text-muted">{formatDateTime(item.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/account" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-center text-sm font-medium text-gold-deep hover:bg-cream-soft">
            View all bookings
          </Link>
        </div>
      )}
    </div>
  );
}
