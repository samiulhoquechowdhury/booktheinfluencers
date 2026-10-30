"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOnboarding, useTalentProfile } from "@/lib/api/hooks";
import { errorMessage, type Session } from "@/lib/api/client";
import { RequireSession } from "@/components/auth/require-session";
import { ErrorState, Spinner } from "@/components/ui/feedback";
import { OnboardingFlow } from "./onboarding-flow";
import { ReviewBadge } from "./profile-summary";

const LINKS = [
  { href: "/portal", label: "Bookings" },
  { href: "/portal/calendar", label: "Blackout dates" },
  { href: "/portal/profile", label: "My profile" },
];

export function PortalShell({ children }: { children: (session: Session, stageName: string) => ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireSession role="TALENT">
      {(session) => {
        return <Shell session={session} pathname={pathname}>{children}</Shell>;
      }}
    </RequireSession>
  );
}

function Shell({ session, pathname, children }: { session: Session; pathname: string; children: (session: Session, stageName: string) => ReactNode }) {
  const onboarding = useOnboarding();
  const state = onboarding.data;
  const approved = state?.status === "APPROVED";
  const { data: talent } = useTalentProfile(approved ? state.slug : null);
  if (onboarding.isPending) return <Spinner label="Loading your profile" />;
  if (onboarding.error) return <ErrorState message={errorMessage(onboarding.error)} onRetry={() => onboarding.refetch()} />;
  const stageName = talent?.stageName ?? (state!.profile.stageName || session.name);
  return (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-gold-deep">Talent portal</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">{stageName}</h1>
                  <ReviewBadge status={state!.status} />
                </div>
              </div>
              {talent && state!.live && (
                <Link href={`/talent/${talent.slug}`} className="btn btn-outline btn-sm">
                  View public profile
                </Link>
              )}
            </div>
            {approved ? (
              <>
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
              </>
            ) : (
              <div className="mt-6">
                <OnboardingFlow key={state!.status} state={state!} />
              </div>
            )}
          </div>
  );
}
