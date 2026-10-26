import type { Tone } from "@/lib/booking-status";

const TONES: Record<Tone, string> = {
  neutral: "bg-cream text-ink-soft ring-line",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  action: "bg-amber-50 text-amber-900 ring-amber-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
