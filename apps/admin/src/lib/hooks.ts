"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "./api";

export const keys = {
  session: ["staff", "session"] as const,
  analytics: ["analytics"] as const,
  leads: ["leads"] as const,
  lead: (id: string) => ["leads", id] as const,
  payments: ["payments"] as const,
  payouts: ["payouts"] as const,
  talents: ["talents"] as const,
  staff: ["staff-accounts"] as const,
  hero: ["site", "hero"] as const,
  followUps: (leadId: string) => ["leads", leadId, "follow-ups"] as const,
  myFollowUps: ["follow-ups", "mine"] as const,
  talent: (slug: string) => ["talents", slug] as const,
  blackouts: (slug: string) => ["talents", slug, "blackouts"] as const,
  inbox: ["inbox"] as const,
  audit: ["audit"] as const,
  talentMessages: (bookingId: string) => ["talent-messages", bookingId] as const,
};

export const useStaffSession = () => useQuery({ queryKey: keys.session, queryFn: api.auth.session, staleTime: Infinity });

/** A staff mutation: refreshes every view (one change can move pipeline, payments and analytics) and toasts. */
export function useStaffMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, success?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "staff" });
      if (success) toast.success(success);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
