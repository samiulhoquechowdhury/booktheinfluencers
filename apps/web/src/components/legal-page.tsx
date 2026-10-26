import type { ReactNode } from "react";

/** Draft legal copy pending lawyer review (docs/task.md T-007). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="shell py-12 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <p className="eyebrow text-gold-deep">Legal</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <p role="note" className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Draft for preview. This text has not been reviewed by a lawyer yet and is not the final policy.
        </p>
        <div className="mt-8 space-y-6 leading-relaxed text-ink-soft [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </article>
    </div>
  );
}
