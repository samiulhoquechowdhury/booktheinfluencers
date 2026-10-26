"use client";

// In-browser mock transport (localStorage). Same interface as http-api.ts; api.ts picks one.

import { allowedNextStages, type LeadStage } from "@repo/utils";
import { TALENTS } from "@repo/mock/catalogue/data";
import { DEMO_OTP, STAFF_DEMO_PASSWORD, STAFF_USERS, internalFor, type StaffUser } from "@repo/mock/internal";
import {
  ApiError,
  bookingsOf,
  contractOf,
  leadMessages,
  milestonesOf,
  quotesOf,
  calendarFor,
  talentMessages,
  type DemoAction,
} from "@repo/mock/server";
import {
  addInternalNote,
  addTalentToLead,
  analytics,
  approveQuote,
  assignOwner,
  bookingAction,
  createQuote,
  draftQuote,
  moveStage,
  recordManualPayment,
  rejectQuote,
  replyToCustomer,
  replyToTalent,
  seesFinance,
  sendPaymentLink,
  setApplicationStatus,
  setCalendarSelfEdit,
  staffSetBlackout,
  can,
  type QuoteDraft,
} from "@repo/mock/staff";
import { loadDb, mutate, readStaffId, writeStaffId } from "@repo/mock/store";
import { addRep, allTalentRecords, createTalent, setRateCard, setRepVerification, setTalentStatus, talentDetail, updateTalent } from "@repo/mock/talent-admin";
import type { ProfileStatus, RateCardInput, RepInput, TalentInput, VerificationStatus } from "@repo/schemas";
import type { LeadRec, MockDb, TalentApplicationRec } from "@repo/mock/types";


const latency = () => new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));
async function call<T>(work: () => T): Promise<T> {
  await latency();
  return work();
}

function actor(): StaffUser {
  const id = readStaffId();
  const staff = STAFF_USERS.find((s) => s.id === id);
  if (!staff) throw new ApiError("UNAUTHENTICATED", "Please sign in");
  return staff;
}

const talentOf = (slug: string) => TALENTS.find((t) => t.slug === slug);

function leadRow(db: MockDb, lead: LeadRec) {
  const customer = db.users.find((u) => u.id === lead.customerId);
  const bookings = bookingsOf(db, lead.id);
  const latestTotal = bookings
    .map((b) => quotesOf(db, b.id).find((q) => q.status !== "SUPERSEDED" && q.status !== "REJECTED")?.totalPaise)
    .filter((v): v is string => Boolean(v))
    .reduce((sum, v) => sum + BigInt(v), 0n);
  return {
    id: lead.id,
    ref: lead.ref,
    stage: lead.stage,
    ownerName: lead.ownerName,
    eventType: lead.eventType,
    eventDate: lead.eventDate,
    city: lead.city,
    contactName: lead.contactName,
    customerPhone: customer?.phone ?? "",
    createdAt: lead.createdAt,
    categories: [...new Set(bookings.flatMap((b) => talentOf(b.talentSlug)?.categories ?? []))],
    valuePaise: latestTotal > 0n ? String(latestTotal) : null,
    bookings: bookings.map((b) => ({ id: b.id, slug: b.talentSlug, name: talentOf(b.talentSlug)?.stageName ?? b.talentSlug, availability: b.availability })),
  };
}
export type LeadRow = ReturnType<typeof leadRow>;

function leadDetail(db: MockDb, lead: LeadRec, staff: StaffUser) {
  const finance = seesFinance(staff);
  const customer = db.users.find((u) => u.id === lead.customerId);
  return {
    ...leadRow(db, lead),
    lead: { ...lead },
    customer: { name: customer?.name ?? lead.contactName, phone: customer?.phone ?? "", email: lead.contactEmail ?? customer?.email ?? null },
    nextStages: allowedNextStages(lead.stage).filter((s) => s !== "CONFIRMED"),
    bookings: bookingsOf(db, lead.id).map((booking) => {
      const payout = db.payouts.find((p) => p.bookingId === booking.id) ?? null;
      return {
        ...booking,
        marginPaise: finance ? booking.marginPaise : null,
        talent: talentOf(booking.talentSlug)!,
        quotes: quotesOf(db, booking.id).map((q) => ({
          ...q,
          internalCostPaise: finance ? q.internalCostPaise : null,
          lineItems: q.lineItems.map((l) => ({ ...l, internalCostPaise: finance ? l.internalCostPaise : null })),
        })),
        contract: contractOf(db, booking.id) ?? null,
        milestones: milestonesOf(db, booking.id).map((m) => ({
          ...m,
          payment: db.payments.find((p) => p.milestoneId === m.id) ?? null,
        })),
        payout,
        messageCount: talentMessages(db, booking.id).length,
      };
    }),
    activities: db.activities.filter((a) => a.leadId === lead.id).toSorted((a, b) => b.at.localeCompare(a.at)),
    messages: leadMessages(db, lead.id),
  };
}
export type LeadDetail = ReturnType<typeof leadDetail>;
export type LeadBooking = LeadDetail["bookings"][number];

export const mockApi = {
  auth: {
    session: () => call(() => STAFF_USERS.find((s) => s.id === readStaffId()) ?? null),
    /** AUTH-2 step 1: email + password. */
    password: (email: string, password: string) =>
      call(() => {
        const staff = STAFF_USERS.find((s) => s.email === email.trim().toLowerCase());
        if (!staff || password !== STAFF_DEMO_PASSWORD) throw new ApiError("INVALID_LOGIN", "Email or password is incorrect");
        return { staffId: staff.id };
      }),
    /** AUTH-2 step 2: authenticator (TOTP) code. */
    totp: (staffId: string, code: string) =>
      call(() => {
        if (code !== DEMO_OTP) throw new ApiError("OTP_INVALID", "That code is not right");
        const staff = STAFF_USERS.find((s) => s.id === staffId);
        if (!staff) throw new ApiError("INVALID_LOGIN", "Start again");
        writeStaffId(staff.id);
        return staff;
      }),
    signOut: () => call(() => writeStaffId(null)),
  },

  analytics: () => call(() => analytics(loadDb(), actor())),

  leads: {
    list: () =>
      call(() => {
        actor();
        const db = loadDb();
        return db.leads.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((lead) => leadRow(db, lead));
      }),
    get: (leadId: string) =>
      call(() => {
        const staff = actor();
        const db = loadDb();
        const lead = db.leads.find((l) => l.id === leadId);
        if (!lead) throw new ApiError("NOT_FOUND", "Lead not found");
        return leadDetail(db, lead, staff);
      }),
    assign: (leadId: string, ownerName: string) => call(() => mutate((db) => assignOwner(db, actor(), leadId, ownerName))),
    move: (leadId: string, to: LeadStage, reason?: string) => call(() => mutate((db) => moveStage(db, actor(), leadId, to, reason))),
    addTalent: (leadId: string, slug: string) => call(() => mutate((db) => addTalentToLead(db, actor(), leadId, slug))),
    note: (leadId: string, text: string) => call(() => mutate((db) => addInternalNote(db, actor(), leadId, text))),
    reply: (leadId: string, body: string) => call(() => mutate((db) => replyToCustomer(db, actor(), leadId, body))),
  },

  bookings: {
    action: (bookingId: string, action: DemoAction, note?: string) =>
      call(() => mutate((db) => bookingAction(db, actor(), bookingId, action, note))),
    messages: (bookingId: string) => call(() => talentMessages(loadDb(), bookingId)),
    replyToTalent: (bookingId: string, body: string) => call(() => mutate((db) => replyToTalent(db, actor(), bookingId, body))),
  },

  quotes: {
    draft: (bookingId: string) => call(() => draftQuote(structuredClone(loadDb()), bookingId)),
    create: (bookingId: string, draft: QuoteDraft) => call(() => mutate((db) => createQuote(db, actor(), bookingId, draft).id)),
    approve: (quoteId: string) => call(() => mutate((db) => approveQuote(db, actor(), quoteId))),
    reject: (quoteId: string, reason: string) => call(() => mutate((db) => rejectQuote(db, actor(), quoteId, reason))),
  },

  payments: {
    list: () =>
      call(() => {
        actor();
        const db = loadDb();
        return db.milestones
          .map((m) => {
            const booking = db.bookings.find((b) => b.id === m.bookingId)!;
            const lead = db.leads.find((l) => l.id === booking.leadId)!;
            return {
              ...m,
              leadId: lead.id,
              ref: lead.ref,
              customer: lead.contactName,
              talent: talentOf(booking.talentSlug)?.stageName ?? booking.talentSlug,
              payment: db.payments.find((p) => p.milestoneId === m.id) ?? null,
              contractSigned: contractOf(db, booking.id)?.status === "SIGNED",
            };
          })
          .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate));
      }),
    link: (milestoneId: string) => call(() => mutate((db) => sendPaymentLink(db, actor(), milestoneId))),
    manual: (milestoneId: string, reference: string) => call(() => mutate((db) => recordManualPayment(db, actor(), milestoneId, reference))),
  },

  payouts: {
    list: () =>
      call(() => {
        const staff = actor();
        if (!seesFinance(staff)) throw new ApiError("FORBIDDEN", "Payouts are visible to Accounts only");
        const db = loadDb();
        return db.payouts.map((p) => {
          const booking = db.bookings.find((b) => b.id === p.bookingId)!;
          const lead = db.leads.find((l) => l.id === booking.leadId)!;
          return { ...p, leadId: lead.id, ref: lead.ref, eventDate: lead.eventDate, talent: talentOf(booking.talentSlug)?.stageName ?? booking.talentSlug, repName: internalFor(booking.talentSlug).repName };
        });
      }),
  },

  talents: {
    list: () =>
      call(() => {
        const staff = actor();
        const db = loadDb();
        const showRates = can(staff, "SALES", "TALENT_MANAGER", "ACCOUNTS");
        return allTalentRecords(db).map((t) => ({
          slug: t.slug,
          stageName: t.stageName,
          headline: t.headline,
          baseCity: t.baseCity,
          languages: t.languages,
          tier: t.tier,
          status: t.status,
          verified: t.reps.some((r) => r.verification === "VERIFIED"),
          repName: t.reps[0]?.name ?? "—",
          feeBandMinPaise: t.feeBandMinPaise,
          feeBandMaxPaise: t.feeBandMaxPaise,
          openBookings: db.bookings.filter((b) => b.talentSlug === t.slug && !b.cancelledAt && !b.completedAt).length,
          rateCard: showRates ? t.rateCard : null,
        }));
      }),
    get: (slug: string) => call(() => talentDetail(loadDb(), actor(), slug)),
    create: (input: TalentInput) => call(() => mutate((db) => createTalent(db, actor(), input))),
    update: (slug: string, input: TalentInput) => call(() => mutate((db) => updateTalent(db, actor(), slug, input))),
    setStatus: (slug: string, status: ProfileStatus) => call(() => mutate((db) => setTalentStatus(db, actor(), slug, status))),
    setRateCard: (slug: string, card: RateCardInput) => call(() => mutate((db) => setRateCard(db, actor(), slug, card))),
    addRep: (slug: string, rep: RepInput) => call(() => mutate((db) => addRep(db, actor(), slug, rep))),
    setRepVerification: (repId: string, verification: VerificationStatus) => call(() => mutate((db) => setRepVerification(db, actor(), repId, verification))),
    blackouts: (slug: string) => call(() => calendarFor(loadDb(), slug)),
    setBlackout: (slug: string, date: string, on: boolean, note?: string) => call(() => mutate((db) => staffSetBlackout(db, actor(), slug, date, on, note))),
    setSelfEdit: (slug: string, selfEdit: boolean) => call(() => mutate((db) => setCalendarSelfEdit(db, actor(), slug, selfEdit))),
  },

  inbox: {
    get: () =>
      call(() => {
        actor();
        const db = loadDb();
        return {
          contactRequests: db.contactRequests.toSorted((a, b) => b.at.localeCompare(a.at)),
          applications: db.talentApplications.toSorted((a, b) => b.at.localeCompare(a.at)),
          newsletter: db.newsletter.toSorted((a, b) => b.at.localeCompare(a.at)),
        };
      }),
    setApplication: (id: string, status: TalentApplicationRec["status"]) => call(() => mutate((db) => setApplicationStatus(db, actor(), id, status))),
  },

  audit: () =>
    call(() => {
      const staff = actor();
      if (!can(staff, "SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "The audit log is for super admins only");
      return loadDb().audit.toSorted((a, b) => b.at.localeCompare(a.at));
    }),
};
