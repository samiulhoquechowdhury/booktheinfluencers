import Link from "next/link";
import { AlertCircle, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <LoaderCircle className="size-5 animate-spin text-gold-deep" aria-hidden />
      {label}…
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-cream-soft px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-white text-gold-deep shadow-sm">{icon}</span>
      <h2 className="mt-5 font-serif text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-dark mt-6">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-card border border-rose-200 bg-rose-50 px-6 py-12 text-center">
      <AlertCircle className="size-8 text-rose-600" aria-hidden />
      <p className="mt-3 font-display font-semibold text-rose-900">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-outline btn-sm mt-5">
          Try again
        </button>
      )}
    </div>
  );
}

export function PageIntro({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      {eyebrow && <p className="eyebrow text-gold-deep">{eyebrow}</p>}
      <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">{title}</h1>
      {children && <div className="mt-4 leading-relaxed text-muted">{children}</div>}
    </div>
  );
}
