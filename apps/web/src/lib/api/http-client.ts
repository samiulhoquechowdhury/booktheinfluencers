"use client";

import type {
  AssistantReply,
  AssistantStatus,
  CustomerBooking,
  CustomerLead,
  EnquiryFormValues,
  OnboardingDocument,
  OnboardingState,
  TalentBooking,
  TalentCalendar,
  TalentProfile,
  TalentSummary,
} from "@repo/schemas";
import { ApiError } from "@repo/mock/server";
import { saveBlob } from "@/lib/download";
import type { mockApi } from "./mock-client";
import type { Message, Session } from "./types";

// HTTP transport for the NestJS API (/v1). Same interface as mock-client.ts.
// The access token lives in memory only; the httpOnly refresh cookie restores it on page load.

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/v1";

let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;

type Options = { method?: string; body?: unknown; auth?: boolean; retried?: boolean };

async function request<T>(path: string, { method = "GET", body, auth = true, retried = false }: Options = {}): Promise<T> {
  if (auth && !accessToken && !retried) await refresh();
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined && { "content-type": "application/json" }),
      ...(auth && accessToken && { authorization: `Bearer ${accessToken}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Access tokens last 15 minutes: refresh once and retry.
  if (res.status === 401 && auth && !retried) {
    accessToken = null;
    if (await refresh()) return request<T>(path, { method, body, auth, retried: true });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(error?.code ?? "HTTP_ERROR", error?.message ?? "Something went wrong. Please try again.");
  }
  return data as T;
}

type IssuedSession = { accessToken: string; user: ApiUser };
type ApiUser = Omit<Session, "phone"> & { phone: string | null };
const toSession = (user: ApiUser): Session => ({ ...user, phone: user.phone ?? "" });

/** Shares one in-flight refresh between concurrent requests. */
function refresh() {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const session = (await res.json()) as IssuedSession;
      accessToken = session.accessToken;
      return toSession(session.user);
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const json = <T>(path: string, body?: unknown, method = "POST") => request<T>(path, { method, body });

/** Signed-in file fetch, refreshing the session once if needed. */
async function fetchFile(path: string, retried = false): Promise<Response> {
  if (!accessToken && !retried) await refresh();
  const res = await fetch(`${BASE}${path}`, { credentials: "include", headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  if (res.status === 401 && !retried) {
    accessToken = null;
    if (await refresh()) return fetchFile(path, true);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error?.code ?? "HTTP_ERROR", data?.error?.message ?? "Couldn't download that file. Please try again.");
  }
  return res;
}

/** Signed-in file download: the file name comes from the API's Content-Disposition header. */
async function download(path: string): Promise<void> {
  const res = await fetchFile(path);
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "document.pdf";
  saveBlob(await res.blob(), name);
}

/** Uploads go as raw bytes with their own content type (the API's JSON parser skips them). */
async function upload<T>(path: string, file: Blob, retried = false): Promise<T> {
  if (!accessToken && !retried) await refresh();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type, ...(accessToken && { authorization: `Bearer ${accessToken}` }) },
    body: file,
  });
  if (res.status === 401 && !retried) {
    accessToken = null;
    if (await refresh()) return upload(path, file, true);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.code ?? "HTTP_ERROR", data?.error?.message ?? "Upload failed. Please try again.");
  return data as T;
}

export const httpApi: typeof mockApi = {
  auth: {
    getSession: async () => (accessToken ? toSession(await request<ApiUser>("/auth/me")) : refresh()),
    requestOtp: (phone) => request("/auth/otp/send", { method: "POST", body: { phone }, auth: false }),
    verifyOtp: async (input) => {
      const session = await request<IssuedSession>("/auth/otp/verify", { method: "POST", body: input, auth: false });
      accessToken = session.accessToken;
      return toSession(session.user);
    },
    signOut: async () => {
      await request("/auth/logout", { method: "POST", auth: false });
      accessToken = null;
    },
    updateProfile: async (input) => toSession(await json<ApiUser>("/auth/me", input, "PATCH")),
  },

  enquiries: {
    submit: (values: EnquiryFormValues) => json<{ leadId: string; ref: string }>("/enquiries", values),
  },

  bookings: {
    list: () => request<CustomerLead[]>("/me/leads"),
    get: (leadId) => request<CustomerLead>(`/me/leads/${encodeURIComponent(leadId)}`),
    acceptQuote: (quoteId) => json<void>(`/quotes/${encodeURIComponent(quoteId)}/accept`),
    requestChanges: (quoteId, note) => json<void>(`/quotes/${encodeURIComponent(quoteId)}/request-changes`, { note }),
    requestCancellation: (bookingId, reason) => json<void>(`/bookings/${encodeURIComponent(bookingId)}/cancellation-request`, { reason }),
    startCheckout: (milestoneId) => json<{ checkoutUrl: string }>(`/milestones/${encodeURIComponent(milestoneId)}/checkout`),
  },

  documents: {
    quotePdf: (quoteId) => download(`/quotes/${encodeURIComponent(quoteId)}/pdf`),
    contractPdf: (contractId) => download(`/contracts/${encodeURIComponent(contractId)}/pdf`),
  },

  providers: {
    checkoutDetails: (milestoneId) => request(`/dev/checkout/${encodeURIComponent(milestoneId)}`),
    pay: (milestoneId, method, outcome) => json(`/dev/checkout/${encodeURIComponent(milestoneId)}/pay`, { method, outcome }),
    contractDetails: (contractId) =>
      request<{ contractId: string; status: string; signerName: string; lead: CustomerLead; booking: CustomerBooking }>(`/dev/esign/${encodeURIComponent(contractId)}`) as ReturnType<
        typeof mockApi.providers.contractDetails
      >,
    sign: (contractId, signedName) => json<void>(`/dev/esign/${encodeURIComponent(contractId)}/sign`, { signedName }),
  },

  favourites: {
    list: () => request<string[]>("/me/favourites"),
    toggle: async (slug) => {
      const saved = !(await request<string[]>("/me/favourites")).includes(slug);
      await request(`/me/favourites/${encodeURIComponent(slug)}`, { method: saved ? "PUT" : "DELETE" });
      return { saved };
    },
  },

  talent: {
    bookings: () => request<TalentBooking[]>("/talent/bookings"),
    booking: (bookingId) => request<TalentBooking>(`/talent/bookings/${encodeURIComponent(bookingId)}`),
    blackouts: () => request<TalentCalendar>("/talent/blackouts"),
    setBlackout: (date, on) => request<void>(`/talent/blackouts/${encodeURIComponent(date)}`, { method: on ? "PUT" : "DELETE" }),

    onboarding: {
      state: () => request<OnboardingState>("/talent/onboarding"),
      save: (profile) => request<OnboardingState>("/talent/onboarding", { method: "PUT", body: profile }),
      uploadPhoto: (photo, width, height) => upload<{ url: string }>(`/talent/onboarding/photo?width=${width}&height=${height}`, photo),
      uploadDocument: (type, file) => upload<OnboardingDocument>(`/talent/onboarding/documents?type=${type}&fileName=${encodeURIComponent(file.name)}`, file),
      deleteDocument: (id) => request<void>(`/talent/onboarding/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
      document: (id) => fetchFile(`/talent/onboarding/documents/${encodeURIComponent(id)}`).then((res) => res.blob()),
      submit: () => json<OnboardingState>("/talent/onboarding/submit"),
    },
  },

  messages: {
    forLead: (leadId) => request<Message[]>(`/me/leads/${encodeURIComponent(leadId)}/messages`),
    sendForLead: (leadId, body) => json<Message>(`/me/leads/${encodeURIComponent(leadId)}/messages`, { body }),
    forTalentBooking: (bookingId) => request<Message[]>(`/talent/bookings/${encodeURIComponent(bookingId)}/messages`),
    sendForTalentBooking: (bookingId, body) => json<Message>(`/talent/bookings/${encodeURIComponent(bookingId)}/messages`, { body }),
  },

  notifications: {
    list: () => request("/me/notifications"),
    markSeen: () => json<void>("/me/notifications/seen"),
  },

  contact: {
    submit: (input) => request("/contact", { method: "POST", body: input, auth: false }),
  },

  applications: {
    submit: (input) => request("/talent-applications", { method: "POST", body: input, auth: false }),
  },

  newsletter: {
    subscribe: (email) => request("/newsletter", { method: "POST", body: { email }, auth: false }),
  },

  catalogue: {
    summaries: async (slugs) => {
      if (slugs.length === 0) return [];
      const res = await request<{ data: TalentSummary[] }>(`/talents?slugs=${encodeURIComponent(slugs.join(","))}`, { auth: false });
      // Keep the caller's order (e.g. most recently saved first).
      return slugs.flatMap((slug) => res.data.filter((t) => t.slug === slug));
    },
    profile: (slug) => request<TalentProfile>(`/talents/${encodeURIComponent(slug)}`, { auth: false }),
    blockedDates: (slug) => request(`/talents/${encodeURIComponent(slug)}/blocked-dates`, { auth: false }),
    search: async (q) => (await request<{ data: TalentSummary[] }>(`/talents?q=${encodeURIComponent(q)}`, { auth: false })).data.slice(0, 8),
  },

  assistant: {
    status: () => request<AssistantStatus>("/assistant/status", { auth: false }),
    chat: (input) => request<AssistantReply>("/assistant/chat", { method: "POST", body: input, auth: false }),
  },

  /** Demo controls stand in for staff; with a real API, staff use apps/admin instead. */
  demo: {
    run: () => Promise.reject(new ApiError("DEMO_ONLY", "Use the staff CRM for this")),
    replyAsManager: () => Promise.reject(new ApiError("DEMO_ONLY", "Use the staff CRM for this")),
    replyAsTeam: () => Promise.reject(new ApiError("DEMO_ONLY", "Use the staff CRM for this")),
    reset: () => Promise.reject(new ApiError("DEMO_ONLY", "Not available with the real API")),
  },
};
