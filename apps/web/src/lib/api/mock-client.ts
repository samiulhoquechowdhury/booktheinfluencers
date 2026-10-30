"use client";

import { EnquiryInputSchema, INDIAN_MOBILE, type EnquiryFormValues, type IdDocumentType, type OnboardingProfile } from "@repo/schemas";
import { ACCOUNT_MANAGER, DEMO_OTP } from "@repo/mock/internal";
import {
  ApiError,
  acceptQuote,
  handleEsignWebhook,
  handleGatewayWebhook,
  leadMessages,
  newId,
  nowIso,
  postLeadMessage,
  postTalentMessage,
  requestCancellation,
  requestQuoteChanges,
  runDemoAction,
  setCalendarDate,
  startCheckout,
  submitContactRequest,
  submitEnquiry,
  submitTalentApplication,
  subscribeNewsletter,
  calendarFor,
  talentMessages,
  type DemoAction,
} from "@repo/mock/server";
import { toCustomerLead, toTalentBooking } from "@repo/mock/serializers";
import { contractPdfData, quotePdfData } from "@repo/mock/documents";
import { recordLogin } from "@repo/mock/login-events";
import { assertCanSignIn, canUseAccount } from "@repo/mock/users";
import { addOnboardingDocument, ensureOnboardingDraft, onboardingState, ownDocumentUrl, removeOnboardingDocument, saveOnboarding, submitOnboarding } from "@repo/mock/onboarding";
import { pdfFonts, saveBlob } from "@/lib/download";
import { loadDb, mutate, readSessionUserId, resetDb, writeSessionUserId } from "@repo/mock/store";
import type { MessageRec, MockDb, UserRec } from "@repo/mock/types";
import { getTalent, getTalentSummaries, searchTalents } from "@repo/mock/catalogue/query";
import type { Message, Session } from "./types";

// In-browser mock transport (localStorage). Same interface as http-client.ts; client.ts picks one.

const latency = () => new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 350));

async function call<T>(work: () => T): Promise<T> {
  await latency();
  return work();
}

const toSession = (user: UserRec): Session => ({
  id: user.id,
  name: user.name,
  phone: user.phone,
  email: user.email,
  roles: user.roles,
  talentSlug: user.talentSlug,
});

function currentUser(db: MockDb): UserRec {
  const id = readSessionUserId();
  const user = id ? db.users.find((u) => u.id === id) : undefined;
  if (!user || !canUseAccount(user)) throw new ApiError("UNAUTHENTICATED", "Please sign in to continue");
  return user;
}

const readDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ApiError("VALIDATION", "Couldn't read that file"));
    reader.readAsDataURL(file);
  });

function currentTalent(db: MockDb) {
  const user = currentUser(db);
  if (!user.roles.includes("TALENT") || !user.talentSlug) throw new ApiError("FORBIDDEN", "Talent accounts only");
  return { user, slug: user.talentSlug };
}

export const mockApi = {
  auth: {
    getSession: () =>
      call(() => {
        const id = readSessionUserId();
        const user = id ? loadDb().users.find((u) => u.id === id) : undefined;
        return user && canUseAccount(user) ? toSession(user) : null;
      }),

    requestOtp: (phone: string) =>
      call(() => {
        if (!INDIAN_MOBILE.test(phone)) throw new ApiError("VALIDATION", "Enter a 10-digit Indian mobile number");
        return { sentTo: phone, resendInSeconds: 30 };
      }),

    /** AUTH-1/AUTH-4: phone OTP; a new customer account is created on first verify. A new talent sign-in starts a private draft profile. */
    verifyOtp: (input: { phone: string; code: string; name?: string; as: "customer" | "talent" }) =>
      call(() => {
        try {
          return mutate((db) => {
            if (input.code !== DEMO_OTP) throw new ApiError("OTP_INVALID", "That code is not right. Try again.");
            let user = db.users.find((u) => u.phone === input.phone);
            let created = false;
            if (user) assertCanSignIn(user);
            if (input.as === "talent") {
              if (!user) {
                user = { id: newId("usr"), phone: input.phone, name: input.name?.trim() || "New artist", email: null, roles: ["TALENT"], talentSlug: null, createdAt: new Date().toISOString() };
                db.users.push(user);
                created = true;
              } else if (!user.roles.includes("TALENT")) {
                user.roles.push("TALENT");
              }
              ensureOnboardingDraft(db, user);
            } else if (!user) {
              user = {
                id: newId("usr"),
                phone: input.phone,
                name: input.name?.trim() || "Guest",
                email: null,
                roles: ["CUSTOMER"],
                talentSlug: null,
                createdAt: new Date().toISOString(),
              };
              db.users.push(user);
              created = true;
            } else if (!user.roles.includes("CUSTOMER")) {
              user.roles.push("CUSTOMER");
            }
            user!.lastLoginAt = nowIso();
            user!.signedOutAt = null;
            writeSessionUserId(user!.id);
            recordLogin(db, { audience: input.as, event: "sign_in", identifier: input.phone, userId: user?.id ?? null, userName: user?.name ?? null, detail: created ? "New account" : null });
            return toSession(user!);
          });
        } catch (error) {
          // The failed change was thrown away, so the attempt is saved on its own.
          if (error instanceof ApiError) {
            mutate((db) => {
              const known = db.users.find((u) => u.phone === input.phone);
              recordLogin(db, { audience: input.as, event: "sign_in_failed", identifier: input.phone, userId: known?.id ?? null, userName: known?.name ?? null, detail: error.code === "ACCOUNT_BLOCKED" ? "Account blocked" : error.code === "ACCOUNT_DISABLED" ? "Account deactivated" : "Wrong or expired code" });
            });
          }
          throw error;
        }
      }),

    signOut: () =>
      call(() =>
        mutate((db) => {
          const user = db.users.find((u) => u.id === readSessionUserId());
          if (user) recordLogin(db, { audience: user.roles.includes("CUSTOMER") ? "customer" : "talent", event: "sign_out", identifier: user.phone, userId: user.id, userName: user.name, detail: null });
          writeSessionUserId(null);
        }),
      ),

    updateProfile: (input: { name: string; email: string }) =>
      call(() =>
        mutate((db) => {
          const user = currentUser(db);
          if (input.name.trim().length < 2) throw new ApiError("VALIDATION", "Enter your name");
          user.name = input.name.trim();
          user.email = input.email.trim() || null;
          return toSession(user);
        }),
      ),
  },

  enquiries: {
    submit: (values: EnquiryFormValues) =>
      call(() =>
        mutate((db) => {
          const user = currentUser(db);
          const input = EnquiryInputSchema.parse(values);
          const lead = submitEnquiry(db, user.id, input);
          if (!user.email && input.email) user.email = input.email;
          if (user.name === "Guest") user.name = input.contactName;
          return { leadId: lead.id, ref: lead.ref };
        }),
      ),
  },

  bookings: {
    list: () =>
      call(() => {
        const db = loadDb();
        const user = currentUser(db);
        return db.leads
          .filter((lead) => lead.customerId === user.id)
          .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((lead) => toCustomerLead(db, lead));
      }),

    get: (leadId: string) =>
      call(() => {
        const db = loadDb();
        const user = currentUser(db);
        const lead = db.leads.find((l) => l.id === leadId && l.customerId === user.id);
        if (!lead) throw new ApiError("NOT_FOUND", "We couldn't find that booking");
        return toCustomerLead(db, lead);
      }),

    acceptQuote: (quoteId: string) => call(() => mutate((db) => acceptQuote(db, currentUser(db).id, quoteId))),

    requestChanges: (quoteId: string, note: string) =>
      call(() => mutate((db) => requestQuoteChanges(db, currentUser(db).id, quoteId, note))),

    requestCancellation: (bookingId: string, reason: string) =>
      call(() => mutate((db) => requestCancellation(db, currentUser(db).id, bookingId, reason))),

    /** PAY-1: returns the gateway hand-off. Payment state only changes from the gateway's webhook. */
    startCheckout: (milestoneId: string) =>
      call(() =>
        mutate((db) => {
          const milestone = startCheckout(db, currentUser(db).id, milestoneId);
          return { checkoutUrl: `/checkout/${milestone.id}` };
        }),
      ),
  },

  /** Simulated third-party screens. In production these are the gateway's and e-sign vendor's own pages. */
  documents: {
    /** Demo mode: the PDF is built in the browser from the mock store, with the same generator as the API. */
    quotePdf: async (quoteId: string) => {
      const data = await call(() => {
        const db = loadDb();
        return quotePdfData(db, quoteId, currentUser(db).id);
      });
      // Loaded on demand so pdf-lib isn't in every visitor's bundle.
      const { buildQuotePdf, pdfFileName } = await import("@repo/pdf");
      saveBlob(new Blob([(await buildQuotePdf(data, await pdfFonts())) as BlobPart], { type: "application/pdf" }), pdfFileName("quote", data.ref, data.version));
    },
    contractPdf: async (contractId: string) => {
      const data = await call(() => {
        const db = loadDb();
        return contractPdfData(db, contractId, currentUser(db).id);
      });
      const { buildContractPdf, pdfFileName } = await import("@repo/pdf");
      saveBlob(new Blob([(await buildContractPdf(data, await pdfFonts())) as BlobPart], { type: "application/pdf" }), pdfFileName("contract", data.ref));
    },
  },

  providers: {
    checkoutDetails: (milestoneId: string) =>
      call(() => {
        const db = loadDb();
        const user = currentUser(db);
        const milestone = db.milestones.find((m) => m.id === milestoneId);
        const booking = milestone && db.bookings.find((b) => b.id === milestone.bookingId);
        const lead = booking && db.leads.find((l) => l.id === booking.leadId && l.customerId === user.id);
        if (!milestone || !lead) throw new ApiError("NOT_FOUND", "Payment link not found");
        return {
          milestoneId: milestone.id,
          label: milestone.label,
          amountPaise: milestone.amountPaise,
          status: milestone.status,
          ref: lead.ref,
          leadId: lead.id,
          payerName: user.name,
          payerPhone: user.phone,
        };
      }),

    pay: (milestoneId: string, method: string, outcome: "success" | "failure") =>
      call(() =>
        mutate((db) => {
          const milestone = db.milestones.find((m) => m.id === milestoneId);
          if (!milestone) throw new ApiError("NOT_FOUND", "Payment link not found");
          const gatewayPaymentId = `pay_${newId("rz").slice(3, 17)}`;
          // The gateway calls our webhook; it — not this screen — records the payment.
          handleGatewayWebhook(db, {
            eventId: newId("evt"),
            milestoneId,
            gatewayPaymentId,
            amountPaise: milestone.amountPaise,
            method,
            status: outcome === "success" ? "captured" : "failed",
          });
          return { gatewayPaymentId, outcome };
        }),
      ),

    contractDetails: (contractId: string) =>
      call(() => {
        const db = loadDb();
        const user = currentUser(db);
        const contract = db.contracts.find((c) => c.id === contractId);
        const booking = contract && db.bookings.find((b) => b.id === contract.bookingId);
        const lead = booking && db.leads.find((l) => l.id === booking.leadId && l.customerId === user.id);
        if (!contract || !booking || !lead) throw new ApiError("NOT_FOUND", "Document not found");
        const customerLead = toCustomerLead(db, lead);
        return {
          contractId: contract.id,
          status: contract.status,
          signerName: user.name,
          lead: customerLead,
          booking: customerLead.bookings.find((b) => b.id === booking.id)!,
        };
      }),

    sign: (contractId: string, signedName: string) =>
      call(() =>
        mutate((db) => {
          if (signedName.trim().length < 2) throw new ApiError("VALIDATION", "Type your full name to sign");
          handleEsignWebhook(db, { eventId: newId("evt"), contractId, signedName: signedName.trim() });
        }),
      ),
  },

  favourites: {
    list: () =>
      call(() => {
        const db = loadDb();
        return db.favourites[currentUser(db).id] ?? [];
      }),

    toggle: (slug: string) =>
      call(() =>
        mutate((db) => {
          const user = currentUser(db);
          const current = new Set(db.favourites[user.id] ?? []);
          const saved = !current.has(slug);
          if (saved) current.add(slug);
          else current.delete(slug);
          db.favourites[user.id] = [...current];
          return { saved };
        }),
      ),
  },

  talent: {
    bookings: () =>
      call(() => {
        const db = loadDb();
        const { slug } = currentTalent(db);
        return db.bookings
          .filter((b) => b.talentSlug === slug && b.availability !== "NOT_CHECKED")
          .map((b) => toTalentBooking(db, b))
          .toSorted((a, b) => a.eventDate.localeCompare(b.eventDate));
      }),

    booking: (bookingId: string) =>
      call(() => {
        const db = loadDb();
        const { slug } = currentTalent(db);
        const booking = db.bookings.find((b) => b.id === bookingId && b.talentSlug === slug);
        if (!booking || booking.availability === "NOT_CHECKED") throw new ApiError("NOT_FOUND", "Booking not found");
        return toTalentBooking(db, booking);
      }),

    blackouts: () => call(() => calendarFor(loadDb(), currentTalent(loadDb()).slug)),

    setBlackout: (date: string, on: boolean) => call(() => mutate((db) => setCalendarDate(db, currentTalent(db).slug, date, on, "artist"))),

    onboarding: {
      state: () =>
        call(() => {
          const db = loadDb();
          return onboardingState(db, currentTalent(db).slug);
        }),
      save: (profile: OnboardingProfile) => call(() => mutate((db) => saveOnboarding(db, currentTalent(db).slug, profile))),
      /** The photo arrives already resized by the browser (lib/image.ts). */
      uploadPhoto: async (photo: Blob, _width: number, _height: number) => {
        const url = await readDataUrl(photo);
        return call(() => {
          currentTalent(loadDb());
          return { url };
        });
      },
      uploadDocument: async (type: IdDocumentType, file: File) => {
        const dataUrl = await readDataUrl(file);
        return call(() => mutate((db) => addOnboardingDocument(db, currentTalent(db).slug, type, { fileName: file.name, mime: file.type, size: file.size, dataUrl })));
      },
      deleteDocument: (id: string) => call(() => mutate((db) => removeOnboardingDocument(db, currentTalent(db).slug, id))),
      document: async (id: string) => {
        const url = await call(() => {
          const db = loadDb();
          return ownDocumentUrl(db, currentTalent(db).slug, id);
        });
        return (await fetch(url)).blob();
      },
      submit: () => call(() => mutate((db) => submitOnboarding(db, currentTalent(db).slug))),
    },
  },

  messages: {
    /** Customer ↔ booking manager thread for one brief. */
    forLead: (leadId: string) =>
      call(() => {
        const db = loadDb();
        ownLead(db, leadId);
        return leadMessages(db, leadId).map(toMessage);
      }),

    sendForLead: (leadId: string, body: string) =>
      call(() =>
        mutate((db) => {
          const user = currentUser(db);
          ownLead(db, leadId);
          return toMessage(postLeadMessage(db, leadId, "customer", user.name, body));
        }),
      ),

    /** Talent ↔ our team thread for one booking. */
    forTalentBooking: (bookingId: string) =>
      call(() => {
        const db = loadDb();
        ownTalentBooking(db, bookingId);
        return talentMessages(db, bookingId).map(toMessage);
      }),

    sendForTalentBooking: (bookingId: string, body: string) =>
      call(() =>
        mutate((db) => {
          const { user } = ownTalentBooking(db, bookingId);
          return toMessage(postTalentMessage(db, bookingId, "talent", user.name, body));
        }),
      ),
  },

  notifications: {
    list: () =>
      call(() => {
        const db = loadDb();
        const user = currentUser(db);
        const leads = db.leads.filter((lead) => lead.customerId === user.id);
        const items = [
          ...db.activities
            .filter((a) => !a.internal && leads.some((l) => l.id === a.leadId))
            .map((a) => ({ id: a.id, at: a.at, title: a.title, body: a.body, href: `/account/bookings/${a.leadId}` })),
          ...db.messages
            .filter((m) => m.author === "staff" && m.thread.kind === "lead" && leads.some((l) => m.thread.kind === "lead" && l.id === m.thread.leadId))
            .map((m) => ({
              id: m.id,
              at: m.at,
              title: `New message from ${m.authorName}`,
              body: m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body,
              href: `/account/bookings/${m.thread.kind === "lead" ? m.thread.leadId : ""}#messages`,
            })),
        ]
          .toSorted((a, b) => b.at.localeCompare(a.at))
          .slice(0, 20);
        const seenAt = db.notificationsSeenAt[user.id] ?? "";
        return { items, unread: items.filter((item) => item.at > seenAt).length };
      }),

    markSeen: () =>
      call(() =>
        mutate((db) => {
          db.notificationsSeenAt[currentUser(db).id] = nowIso();
        }),
      ),
  },

  contact: {
    submit: (input: { name: string; phone: string; email: string; topic: string; message: string }) =>
      call(() => mutate((db) => ({ ref: submitContactRequest(db, input).ref }))),
  },

  applications: {
    submit: (input: Parameters<typeof submitTalentApplication>[1]) =>
      call(() => mutate((db) => ({ ref: submitTalentApplication(db, input).ref }))),
  },

  newsletter: {
    subscribe: (email: string) => call(() => mutate((db) => subscribeNewsletter(db, email))),
  },

  /** Catalogue reads for client components (server pages use lib/catalogue.ts). */
  catalogue: {
    summaries: (slugs: string[]) => call(() => getTalentSummaries(slugs)),
    profile: (slug: string) =>
      call(() => {
        const talent = getTalent(slug);
        if (!talent) throw new ApiError("NOT_FOUND", "Talent not found");
        return talent;
      }),
    search: (q: string) => call(() => searchTalents({ q }).data.slice(0, 8)),
  },

  demo: {
    run: (bookingId: string, action: DemoAction, note?: string) =>
      call(() => mutate((db) => runDemoAction(db, bookingId, action, note))),
    /** Stand-in for a staff reply from the CRM. */
    replyAsManager: (leadId: string, body: string) =>
      call(() => mutate((db) => toMessage(postLeadMessage(db, leadId, "staff", ACCOUNT_MANAGER.name, body)))),
    replyAsTeam: (bookingId: string, body: string) =>
      call(() => mutate((db) => toMessage(postTalentMessage(db, bookingId, "staff", ACCOUNT_MANAGER.name, body)))),
    reset: () => call(() => resetDb()),
  },
};

const toMessage = (m: MessageRec): Message => ({ id: m.id, author: m.author, authorName: m.authorName, body: m.body, at: m.at });

function ownLead(db: MockDb, leadId: string) {
  const user = currentUser(db);
  const lead = db.leads.find((l) => l.id === leadId && l.customerId === user.id);
  if (!lead) throw new ApiError("NOT_FOUND", "We couldn't find that booking");
  return lead;
}

function ownTalentBooking(db: MockDb, bookingId: string) {
  const { user, slug } = currentTalent(db);
  const booking = db.bookings.find((b) => b.id === bookingId && b.talentSlug === slug);
  if (!booking) throw new ApiError("NOT_FOUND", "Booking not found");
  return { user, booking };
}
