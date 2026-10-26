"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { getTalent } from "@repo/mock/catalogue/query";
import type { Session } from "@/lib/api/client";
import { RequireSession } from "@/components/auth/require-session";

const LINKS = [
  { href: "/portal", label: "Bookings" },
  { href: "/portal/calendar", label: "Blackout dates" },
];

export function PortalShell({ children }: { children: (session: Session, stageName: string) => ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireSession role="TALENT">
      {(session) => {
        const talent = session.talentSlug ? getTalent(session.talentSlug) : undefined;
        const stageName = talent?.stageName ?? session.name;
        return (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-gold-deep">Talent portal</p>
                <h1 className="mt-2 font-serif text-3xl font-semibold text-ink sm:text-4xl">{stageName}</h1>
              </div>
              {talent && (
                <Link href={`/talent/${talent.slug}`} className="btn btn-outline btn-sm">
                  View public profile
                </Link>
              )}
            </div>
            <nav aria-label="Portal" className="mt-6 flex gap-1 overflow-x-auto rounded-md bg-cream p-1">
              {LINKS.map((link) => {
                const active = link.href === "/portal" ? pathname === "/portal" || pathname.startsWith("/portal/bookings") : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`whitespace-nowrap rounded px-4 py-2 font-display text-sm font-semibold ${
                      active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-8">{children(session, stageName)}</div>
          </div>
        );
      }}
    </RequireSession>
  );
}
