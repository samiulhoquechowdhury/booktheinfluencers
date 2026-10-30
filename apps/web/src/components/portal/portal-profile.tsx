"use client";

import { BadgeCheck } from "lucide-react";
import type { OnboardingState } from "@repo/schemas";
import { formatDate } from "@repo/utils";
import { errorMessage } from "@/lib/api/client";
import { useOnboarding } from "@/lib/api/hooks";
import { ErrorState, Spinner } from "@/components/ui/feedback";
import { PortalShell } from "./portal-shell";
import { ProfileSummary } from "./profile-summary";

export function PortalProfile() {
  return <PortalShell>{() => <Profile />}</PortalShell>;
}

function Profile() {
  const { data: state, isPending, error, refetch } = useOnboarding();
  if (isPending) return <Spinner label="Loading your profile" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  return (
    <div className="space-y-5">
      <VerifiedNote state={state} />
      <ProfileSummary profile={state.profile} documents={state.documents} />
    </div>
  );
}

function VerifiedNote({ state }: { state: OnboardingState }) {
  return (
    <div className="flex gap-3 rounded-card border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
      <BadgeCheck className="size-6 shrink-0" aria-hidden />
      <div>
        <p className="font-display font-semibold">Your profile is verified</p>
        <p className="mt-1 text-sm">
          {state.reviewedAt ? `Our team verified your details on ${formatDate(state.reviewedAt)}.` : "Our team has verified your details."}{" "}
          {state.live ? "Customers can find you on the website." : "Your profile isn't showing on the website right now."} To change anything here, ask your manager.
        </p>
      </div>
    </div>
  );
}
