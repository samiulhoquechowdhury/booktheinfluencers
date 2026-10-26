"use client";

import { ApiError } from "@repo/mock/server";
import { STAFF_ROLES, type StaffRole, type StaffUser } from "@repo/mock/internal";
import type { mockApi, LeadDetail, LeadRow } from "./mock-api";

// HTTP transport for the staff API (/v1/admin). Same interface as mock-api.ts, so the screens
// don't change: the adapters below translate API records into the shapes the screens use.
// Requests go to /v1 on this origin (the website proxies it to apps/api; admin's own next.config does too).

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/v1";

let accessToken: string | null = null;
let refreshing: Promise<StaffUser | null> | null = null;

type ApiUser = { id: string; name: string; email: string | null; roles: string[] };
const toStaff = (user: ApiUser): StaffUser => ({
  id: user.id,
  name: user.name,
  email: user.email ?? "",
  roles: user.roles.filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r)),
});

function refresh() {
  refreshing ??= fetch(`${BASE}/auth/staff/refresh`, { method: "POST", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return (accessToken = null);
      const body = (await res.json()) as { accessToken: string; user: ApiUser };
      accessToken = body.accessToken;
      return toStaff(body.user);
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}, retried = false): Promise<T> {
  const { method = "GET", body, auth = true } = init;
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
  if (res.status === 401 && auth && !retried) {
    accessToken = null;
    if (await refresh()) return request<T>(path, init, true);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.code ?? "HTTP_ERROR", data?.error?.message ?? "Something went wrong. Please try again.");
  return data as T;
}

const post = <T = void>(path: string, body?: unknown) => request<T>(path, { method: "POST", body });
const id = (value: string) => encodeURIComponent(value);
/** API records are a superset of what the screens read; the adapters shape what differs. */
const as = <T>(value: unknown) => value as T;

// ---------- Adapters: API records → the shapes the admin screens already use ----------

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const toThreadMessage = (m: Raw, thread: { kind: "lead"; leadId: string } | { kind: "talent"; bookingId: string }) => ({
  id: m.id,
  thread,
  author: String(m.author).toLowerCase() as "customer" | "talent" | "staff",
  authorName: m.authorName,
  body: m.body,
  at: m.at ?? m.createdAt,
});

export function toLeadDetail(l: Raw): LeadDetail {
  const lead = {
    id: l.id,
    ref: l.ref,
    stage: l.stage,
    ownerName: l.owner?.name ?? null,
    customerId: l.customerId,
    eventType: l.eventType,
    eventDate: l.eventDate,
    altDate: l.altDate,
    city: l.city,
    venue: l.venue,
    audienceSize: l.audienceSize,
    durationMins: l.durationMins,
    budgetMinPaise: l.budgetMinPaise,
    budgetMaxPaise: l.budgetMaxPaise,
    language: l.language,
    notes: l.notes,
    companyName: l.companyName,
    gstin: l.gstin,
    contactName: l.contactName,
    contactEmail: l.contactEmail,
    lostReason: l.lostReason,
    createdAt: l.createdAt,
  };
  return as<LeadDetail>({
    id: l.id,
    ref: l.ref,
    stage: l.stage,
    ownerName: lead.ownerName,
    eventType: l.eventType,
    eventDate: l.eventDate,
    city: l.city,
    contactName: l.contactName,
    customerPhone: l.customer?.phone ?? "",
    createdAt: l.createdAt,
    categories: [],
    valuePaise: null,
    lead,
    customer: { name: l.customer?.name ?? l.contactName, phone: l.customer?.phone ?? "", email: l.contactEmail ?? l.customer?.email ?? null },
    nextStages: l.nextStages,
    bookings: (l.bookings as Raw[]).map((b) => {
      const contract = (b.contracts as Raw[])[0];
      return {
        id: b.id,
        leadId: b.leadId,
        talentSlug: b.talent.slug,
        availability: b.availability,
        repAcceptedAt: b.repAcceptedAt,
        confirmedAt: b.confirmedAt,
        completedAt: b.completedAt,
        completionNote: b.completionNote,
        cancelledAt: b.cancelledAt,
        cancelReason: b.cancelReason,
        sellingTotalPaise: b.sellingTotalPaise,
        payoutTotalPaise: b.payoutTotalPaise,
        marginPaise: b.marginPaise,
        talent: { ...b.talent, photo: b.talent.photoUrl, verified: b.verified },
        quotes: (b.quotes as Raw[]).map((q) => ({ ...q, lineItems: (q.lineItems as Raw[]).map(({ type, description, customerAmountPaise, internalCostPaise, taxRateBps }) => ({ type, description, customerAmountPaise, internalCostPaise, taxRateBps })) })),
        contract: contract
          ? { id: contract.id, bookingId: b.id, status: contract.status, sentAt: contract.sentAt ?? contract.signedAt ?? "", signedAt: contract.signedAt, signedName: contract.signedName, providerRef: contract.providerRef ?? "" }
          : null,
        milestones: (b.milestones as Raw[]).map(({ payments, ...m }) => ({ ...m, payment: (payments as Raw[]).find((p) => p.status === "captured") ?? null })),
        payout: b.payout,
        messageCount: b._count?.messages ?? 0,
      };
    }),
    activities: (l.activities as Raw[]).map((a) => ({ id: a.id, leadId: a.leadId, at: a.createdAt, title: a.title, body: a.body, internal: a.internal })),
    messages: (l.messages as Raw[]).map((m) => toThreadMessage(m, { kind: "lead", leadId: l.id })),
  });
}

export const httpApi: typeof mockApi = {
  auth: {
    session: async () => (accessToken ? toStaff(await request<ApiUser>("/auth/me")) : refresh()),
    /** Step 1 returns a short-lived MFA token; the screens carry it as `staffId` into step 2. */
    password: async (email, password) => ({ staffId: (await request<{ mfaToken: string }>("/auth/staff/login", { method: "POST", body: { email, password }, auth: false })).mfaToken }),
    totp: async (mfaToken, code) => {
      const session = await request<{ accessToken: string; user: ApiUser }>("/auth/staff/mfa", { method: "POST", body: { mfaToken, code }, auth: false });
      accessToken = session.accessToken;
      return toStaff(session.user);
    },
    signOut: async () => {
      await request("/auth/staff/logout", { method: "POST", auth: false });
      accessToken = null;
    },
  },

  analytics: () => request("/admin/analytics"),

  leads: {
    list: () => request<LeadRow[]>("/admin/leads"),
    get: async (leadId) => toLeadDetail(await request<Raw>(`/admin/leads/${id(leadId)}`)),
    assign: async (leadId, ownerName) => {
      const owner = STAFF_DIRECTORY.find((s) => s.name === ownerName);
      if (!owner) throw new ApiError("VALIDATION", "Pick a sales owner");
      await post(`/admin/leads/${id(leadId)}/assign`, { ownerId: owner.id });
    },
    move: (leadId, to, reason) => post(`/admin/leads/${id(leadId)}/transition`, { to, reason }),
    addTalent: (leadId, slug) => post(`/admin/leads/${id(leadId)}/talents`, { slug }),
    note: (leadId, text) => post(`/admin/leads/${id(leadId)}/notes`, { text }),
    reply: async (leadId, body) => {
      await post(`/admin/leads/${id(leadId)}/messages`, { body });
    },
  },

  bookings: {
    action: (bookingId, action, note) => post(`/admin/bookings/${id(bookingId)}/actions`, { action, note }),
    messages: async (bookingId) => (await request<Raw[]>(`/admin/bookings/${id(bookingId)}/messages`)).map((m) => toThreadMessage(m, { kind: "talent", bookingId })),
    replyToTalent: async (bookingId, body) => {
      await post(`/admin/bookings/${id(bookingId)}/messages`, { body });
    },
  },

  quotes: {
    draft: (bookingId) => request(`/admin/bookings/${id(bookingId)}/quote-draft`),
    create: async (bookingId, draft) => (await post<{ id: string }>(`/admin/bookings/${id(bookingId)}/quotes`, draft)).id,
    approve: (quoteId) => post(`/admin/quotes/${id(quoteId)}/approve`),
    reject: (quoteId, reason) => post(`/admin/quotes/${id(quoteId)}/reject`, { reason }),
  },

  payments: {
    list: async () => as(await request("/admin/payments")),
    link: (milestoneId) => post(`/admin/milestones/${id(milestoneId)}/link`),
    manual: (milestoneId, reference) => post(`/admin/milestones/${id(milestoneId)}/manual-payment`, { reference }),
  },

  payouts: {
    list: async () => as(await request("/admin/payouts")),
  },

  talents: {
    list: async () => as(await request("/admin/talents")),
    blackouts: (slug) => request(`/admin/talents/${id(slug)}/blackouts`),
    setBlackout: (slug, date, on) => request(`/admin/talents/${id(slug)}/blackouts/${id(date)}`, { method: on ? "POST" : "DELETE" }),
  },

  inbox: {
    get: async () => {
      const raw = await request<{ contactRequests: Raw[]; applications: Raw[]; newsletter: Raw[] }>("/admin/inbox");
      const withAt = (rows: Raw[]) => rows.map((r) => ({ ...r, at: r.createdAt }));
      return as({ contactRequests: withAt(raw.contactRequests), applications: withAt(raw.applications), newsletter: withAt(raw.newsletter) });
    },
    setApplication: (applicationId, status) => post(`/admin/applications/${id(applicationId)}/status`, { status }),
  },

  audit: async () => as((await request<Raw[]>("/admin/audit")).map((a) => ({ ...a, at: a.createdAt }))),
};

/** Owners are picked by name on screen; the API wants the user id. Seeded staff share these ids. */
const STAFF_DIRECTORY: { id: string; name: string }[] = [];
export function registerStaffDirectory(people: { id: string; name: string }[]) {
  STAFF_DIRECTORY.splice(0, STAFF_DIRECTORY.length, ...people);
}
