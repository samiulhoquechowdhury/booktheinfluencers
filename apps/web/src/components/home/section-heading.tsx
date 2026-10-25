import type { ReactNode } from "react";

type SectionHeadingProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  description?: string;
  tone?: "light" | "dark";
  action?: ReactNode;
};

export function SectionHeading({ id, eyebrow, title, description, tone = "light", action }: SectionHeadingProps) {
  const dark = tone === "dark";
  return (
    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div className="max-w-2xl">
        <p className={`eyebrow ${dark ? "text-warm" : "text-gold-deep"}`}>{eyebrow}</p>
        <h2
          id={id}
          className={`mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl ${dark ? "text-white" : "text-ink"}`}
        >
          {title}
        </h2>
        {description && (
          <p className={`mt-4 leading-relaxed ${dark ? "text-white/70" : "text-muted"}`}>{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
