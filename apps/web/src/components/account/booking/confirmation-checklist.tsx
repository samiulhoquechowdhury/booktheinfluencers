import { Check, Circle } from "lucide-react";
import type { CustomerBooking } from "@repo/schemas";

/** The four OPS-1 conditions, shown so the customer always knows what's left before "Confirmed". */
export function ConfirmationChecklist({ booking }: { booking: CustomerBooking }) {
  const items = [
    { done: booking.quotes.some((q) => q.status === "ACCEPTED"), label: "Quote accepted" },
    { done: booking.contract?.status === "SIGNED", label: "Contract signed" },
    { done: booking.milestones.some((m) => m.isAdvance && m.status === "PAID"), label: "Advance paid" },
    { done: booking.repAccepted, label: "Artist's team accepted" },
  ];

  return (
    <ol aria-label="Confirmation steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <li
          key={item.label}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
            item.done ? "bg-emerald-50 text-emerald-800" : "bg-cream-soft text-muted"
          }`}
        >
          {item.done ? <Check className="size-4 shrink-0" aria-hidden /> : <Circle className="size-4 shrink-0" aria-hidden />}
          <span>
            {item.label}
            <span className="sr-only">{item.done ? " — done" : " — pending"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
