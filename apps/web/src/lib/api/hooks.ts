"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "./client";

// TanStack Query hooks (rules.md §5). Mutations show pending/success/error feedback.

export const keys = {
  session: ["session"] as const,
  bookings: ["bookings"] as const,
  booking: (id: string) => ["bookings", id] as const,
  favourites: ["favourites"] as const,
  talentBookings: ["talent", "bookings"] as const,
  talentBooking: (id: string) => ["talent", "bookings", id] as const,
  blackouts: ["talent", "blackouts"] as const,
  onboarding: ["talent", "onboarding"] as const,
  leadMessages: (leadId: string) => ["messages", "lead", leadId] as const,
  talentMessages: (bookingId: string) => ["messages", "talent", bookingId] as const,
  notifications: ["notifications"] as const,
};

// Catalogue reads from client components (favourites, compare, enquiry picker, portal header).
export function useTalentSummaries(slugs: string[]) {
  return useQuery({ queryKey: ["catalogue", "summaries", slugs], queryFn: () => api.catalogue.summaries(slugs), staleTime: 60_000 });
}

export function useTalentProfile(slug: string | null | undefined) {
  return useQuery({ queryKey: ["catalogue", "profile", slug], queryFn: () => api.catalogue.profile(slug!), enabled: Boolean(slug), staleTime: 60_000 });
}

export const blockedDatesQuery = (slug: string) => ({ queryKey: ["catalogue", "blocked-dates", slug], queryFn: () => api.catalogue.blockedDates(slug), staleTime: 30_000 });

export function useTalentSearch(q: string) {
  const term = q.trim();
  return useQuery({ queryKey: ["catalogue", "search", term], queryFn: () => api.catalogue.search(term), enabled: term.length > 0, staleTime: 60_000 });
}

export function useLeadMessages(leadId: string) {
  return useQuery({ queryKey: keys.leadMessages(leadId), queryFn: () => api.messages.forLead(leadId) });
}

export function useTalentMessages(bookingId: string) {
  return useQuery({ queryKey: keys.talentMessages(bookingId), queryFn: () => api.messages.forTalentBooking(bookingId) });
}

/** Polls gently so manager replies and booking updates show up without a reload. */
export function useNotifications(enabled: boolean) {
  return useQuery({ queryKey: keys.notifications, queryFn: api.notifications.list, enabled, refetchInterval: 20_000 });
}

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: api.auth.getSession, staleTime: Infinity });
}

export function useBookings(enabled = true) {
  return useQuery({ queryKey: keys.bookings, queryFn: api.bookings.list, enabled });
}

export function useBooking(leadId: string, enabled = true) {
  return useQuery({ queryKey: keys.booking(leadId), queryFn: () => api.bookings.get(leadId), enabled });
}

export function useFavourites(enabled = true) {
  return useQuery({ queryKey: keys.favourites, queryFn: api.favourites.list, enabled });
}

export function useTalentBookings(enabled = true) {
  return useQuery({ queryKey: keys.talentBookings, queryFn: api.talent.bookings, enabled });
}

export function useTalentBooking(id: string, enabled = true) {
  return useQuery({ queryKey: keys.talentBooking(id), queryFn: () => api.talent.booking(id), enabled });
}

export function useOnboarding() {
  return useQuery({ queryKey: keys.onboarding, queryFn: api.talent.onboarding.state });
}

export function useBlackouts(enabled = true) {
  return useQuery({ queryKey: keys.blackouts, queryFn: api.talent.blackouts, enabled });
}

/** Mutation that refreshes all booking data and toasts the outcome. */
export function useBookingMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  messages: { success?: string | ((result: TResult) => string) } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: keys.bookings });
      void client.invalidateQueries({ queryKey: ["talent"] });
      void client.invalidateQueries({ queryKey: keys.notifications });
      const message = typeof messages.success === "function" ? messages.success(result) : messages.success;
      if (message) toast.success(message);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useToggleFavourite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.favourites.toggle,
    onMutate: async (slug) => {
      await client.cancelQueries({ queryKey: keys.favourites });
      const previous = client.getQueryData<string[]>(keys.favourites);
      client.setQueryData<string[]>(keys.favourites, (current = []) =>
        current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
      );
      return { previous };
    },
    onError: (error, _slug, context) => {
      client.setQueryData(keys.favourites, context?.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: ({ saved }) => toast.success(saved ? "Saved to favourites" : "Removed from favourites"),
    onSettled: () => client.invalidateQueries({ queryKey: keys.favourites }),
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.auth.signOut,
    onSuccess: () => {
      client.setQueryData(keys.session, null);
      client.removeQueries({ queryKey: keys.bookings });
      client.removeQueries({ queryKey: keys.favourites });
      client.removeQueries({ queryKey: ["talent"] });
      toast.success("Signed out");
    },
  });
}
