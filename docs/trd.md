# TRD — Talent & Celebrity Booking Platform

> Technical Requirements Document · v1.0 · 16 Oct 2026
> Related: `srs.md` (what), `architecture.md` (how it fits), `rules.md` (how we code)

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | One language, shared types |
| Monorepo | Turborepo + pnpm workspaces | Shared packages, cached builds |
| Customer + talent web | Next.js 15 (App Router), React 19 | SSR/SSG for SEO, PWA |
| Admin CRM | Next.js 15 (separate app) | Isolated auth surface, separate deploy |
| UI | Tailwind CSS + shadcn/ui (Radix) | Fast, accessible, themeable |
| Forms / validation | React Hook Form + Zod (shared schemas) | Same schema client and server |
| Data fetching | TanStack Query | Caching, optimistic UI in CRM |
| API | NestJS 11 (REST, OpenAPI) | Modules, guards, DI |
| ORM | Prisma | Type-safe, migrations |
| Database | PostgreSQL 16 | Relational money/state data, full-text search |
| Cache / queue | Redis + BullMQ | Jobs: notifications, reminders, PDFs, webhooks |
| Storage | S3-compatible (AWS S3 ap-south-1 / Cloudflare R2) | Media + private documents |
| Auth | Custom JWT (access 15 min + rotating refresh in httpOnly cookie); OTP for customers; TOTP MFA for staff | Full control over roles |
| Payments | Razorpay (assumed) — Payment Links + Orders + Webhooks | UPI, cards, netbanking |
| E-sign | Provider TBD (Leegality / Digio / SignDesk) behind an adapter | Swappable |
| Email | Resend or AWS SES | |
| SMS / WhatsApp | MSG91 or Gupshup (templates) behind an adapter | DLT-compliant in India |
| PDFs | React-PDF or Puppeteer in worker | Quotes, invoices |
| Search | Postgres full-text (tsvector + GIN), trigram for names | No extra infra |
| Hosting | Web/Admin: Vercel (or AWS). API + worker: AWS ECS Fargate / Railway / Render (India region). DB: managed Postgres (AWS RDS / Neon / Supabase) | |
| Observability | Sentry, pino logs, Better Stack / UptimeRobot | |
| CI/CD | GitHub Actions | lint, typecheck, test, migrate, deploy |
| Testing | Vitest (unit), Supertest (API e2e), Playwright (web e2e) | |

## 2. Repository layout

```
talent-platform/
├─ apps/
│  ├─ web/            # Next.js – public site, customer dashboard, talent portal
│  ├─ admin/          # Next.js – internal CRM
│  ├─ api/            # NestJS – REST API
│  └─ worker/         # NestJS standalone – BullMQ processors
├─ packages/
│  ├─ db/             # Prisma schema, migrations, seed, client
│  ├─ schemas/        # Zod schemas + inferred types (shared contracts)
│  ├─ ui/             # shared components + design tokens
│  ├─ config/         # eslint, tsconfig, tailwind preset
│  └─ utils/          # money, dates, formatting, state machine
├─ docs/              # prd, srs, trd, architecture, design, rules, task, memory
└─ turbo.json
```

## 3. API module map (NestJS)

| Module | Responsibility | Main routes (prefix `/v1`) |
|---|---|---|
| `auth` | OTP, login, refresh, MFA, invites | `/auth/otp/send`, `/auth/otp/verify`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/mfa/*` |
| `users` | Users, roles | `/users`, `/users/me` |
| `catalog` | Public talent listing, search, categories | `GET /talents`, `GET /talents/:slug`, `GET /categories` |
| `talents` | Admin talent CRUD, media, rate cards | `/admin/talents/*`, `/admin/talents/:id/rate-cards` |
| `reps` | Representatives, KYC, verification | `/admin/reps/*` |
| `enquiries` | Public brief submission, leads | `POST /enquiries`, `/admin/leads/*` |
| `bookings` | Booking record, state machine, availability | `/bookings/*`, `/admin/bookings/*`, `POST /admin/bookings/:id/transition` |
| `quotes` | Quote builder, versions, acceptance, PDF | `/admin/bookings/:id/quotes`, `POST /quotes/:id/accept` |
| `contracts` | Generate/upload, e-sign, status | `/admin/bookings/:id/contracts`, `POST /webhooks/esign` |
| `payments` | Milestones, links, webhooks, manual entry, refunds | `/admin/bookings/:id/milestones`, `POST /webhooks/razorpay` |
| `payouts` | Settlement records | `/admin/payouts/*`, `GET /talent/payouts` |
| `documents` | Upload, signed URLs | `POST /documents/upload-url`, `GET /documents/:id/url` |
| `notifications` | Templates, dispatch (queues) | internal |
| `analytics` | Dashboards | `/admin/analytics/*` |
| `audit` | Audit log read | `/admin/audit` |
| `favourites` | Customer favourites | `/me/favourites` |

Conventions: REST, JSON, camelCase; pagination `?page&pageSize` (max 100) with `{ data, meta }`; errors `{ error: { code, message, details } }`; OpenAPI generated at `/docs` (non-prod only).

## 4. Data model (Prisma, abbreviated)

```prisma
enum Role { SUPER_ADMIN SALES TALENT_MANAGER OPS ACCOUNTS TALENT REP CUSTOMER }
enum RepresentationType { TALENT_MANAGED AGENCY_MANAGED PLATFORM_COORDINATED }
enum ProfileStatus { DRAFT PUBLISHED HIDDEN }
enum TalentTier { STANDARD PREMIUM }
enum VerificationStatus { PENDING VERIFIED REJECTED }
enum LeadStage { NEW CONTACTED REQUIREMENT_RECEIVED SHORTLISTED AVAILABILITY_CHECK QUOTE_SENT NEGOTIATION ADVANCE_PENDING CONFIRMED EVENT_COMPLETED SETTLEMENT CLOSED LOST CANCELLED }
enum AvailabilityStatus { NOT_CHECKED AWAITING_MANAGER HOLD_REQUESTED AVAILABLE TENTATIVE UNAVAILABLE CONFIRMED }
enum QuoteStatus { DRAFT PENDING_APPROVAL SENT ACCEPTED REJECTED EXPIRED SUPERSEDED }
enum LineItemType { TALENT_FEE TRAVEL ACCOMMODATION LOCAL_TRANSPORT SECURITY PRODUCTION SERVICE_FEE OTHER }
enum ContractStatus { DRAFT SENT PARTIALLY_SIGNED SIGNED VOID }
enum MilestoneStatus { PENDING LINK_SENT PAID OVERDUE REFUNDED CANCELLED }
enum PayoutStatus { PENDING SCHEDULED PAID ON_HOLD }

model User {
  id String @id @default(cuid())
  phone String? @unique
  email String? @unique
  name String?
  passwordHash String?
  mfaSecret String?           // encrypted
  roles Role[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
}

model Category { id String @id @default(cuid()) slug String @unique name String sortOrder Int @default(0) }

model Talent {
  id String @id @default(cuid())
  slug String @unique
  stageName String
  bio String?
  baseCity String
  travelsTo String[]
  languages String[]
  eventTypes String[]
  tags String[]
  tier TalentTier @default(STANDARD)
  status ProfileStatus @default(DRAFT)
  representationType RepresentationType
  feeBandMinPaise BigInt?     // public
  feeBandMaxPaise BigInt?     // public
  userId String? @unique      // talent login
  categories TalentCategory[]
  media TalentMedia[]
  rateCards RateCard[]        // INTERNAL
  reps TalentRep[]
  blackouts Blackout[]
  searchVector Unsupported("tsvector")?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model RateCard {             // INTERNAL ONLY
  id String @id @default(cuid())
  talentId String
  eventType String?
  minimumRatePaise BigInt
  sellingRatePaise BigInt
  commissionBps Int           // basis points: 1500 = 15%
  notes String?
}

model Representative {
  id String @id @default(cuid())
  name String
  agencyName String?
  phone String
  email String?
  verification VerificationStatus @default(PENDING)
  kycDocumentIds String[]
  userId String? @unique
  talents TalentRep[]
}

model Lead {
  id String @id @default(cuid())
  ref String @unique          // e.g. TB-2026-000123
  stage LeadStage @default(NEW)
  ownerId String?
  customerId String
  eventType String
  eventDate DateTime
  altDate DateTime?
  city String
  venue String?
  audienceSize Int?
  durationMins Int?
  budgetMinPaise BigInt?
  budgetMaxPaise BigInt?
  language String?
  notes String?
  companyName String?
  gstin String?
  source String?              // utm / landing page
  lostReason String?
  bookings Booking[]
  activities Activity[]
}

model Booking {
  id String @id @default(cuid())
  leadId String
  talentId String
  availability AvailabilityStatus @default(NOT_CHECKED)
  repAcceptedAt DateTime?
  confirmedAt DateTime?
  completedAt DateTime?
  cancelledAt DateTime?
  cancelReason String?
  sellingTotalPaise BigInt?   // from accepted quote
  payoutTotalPaise BigInt?    // INTERNAL + talent
  marginPaise BigInt?         // INTERNAL
  quotes Quote[]
  contracts Contract[]
  milestones PaymentMilestone[]
  payout Payout?
  opsChecklist Json?
}

model Quote {
  id String @id @default(cuid())
  bookingId String
  version Int
  status QuoteStatus @default(DRAFT)
  validUntil DateTime
  subtotalPaise BigInt
  taxPaise BigInt
  totalPaise BigInt
  internalCostPaise BigInt    // INTERNAL
  acceptedAt DateTime?
  acceptedByUserId String?
  acceptedIp String?
  approvedById String?
  lineItems QuoteLineItem[]
  milestonePlan Json          // [{label, percentBps|amountPaise, dueDate}]
  @@unique([bookingId, version])
}

model QuoteLineItem {
  id String @id @default(cuid())
  quoteId String
  type LineItemType
  description String
  customerAmountPaise BigInt
  internalCostPaise BigInt     // INTERNAL
  taxRateBps Int               // 1800 = 18%
}

model Contract { id String @id @default(cuid()) bookingId String status ContractStatus documentId String? providerRef String? signedAt DateTime? }

model PaymentMilestone {
  id String @id @default(cuid())
  bookingId String
  label String                 // "Advance", "Balance"
  amountPaise BigInt
  dueDate DateTime
  status MilestoneStatus @default(PENDING)
  isAdvance Boolean @default(false)
  gatewayLinkId String?
  payments Payment[]
}

model Payment {
  id String @id @default(cuid())
  milestoneId String
  method String                // gateway | bank_transfer
  gatewayPaymentId String? @unique
  amountPaise BigInt
  status String                // captured | failed | refunded
  proofDocumentId String?
  receivedAt DateTime
}

model Payout { id String @id @default(cuid()) bookingId String @unique amountPaise BigInt status PayoutStatus @default(PENDING) reference String? paidAt DateTime? }
model Blackout { id String @id @default(cuid()) talentId String date DateTime note String? }
model Favourite { userId String talentId String @@id([userId, talentId]) }
model Document { id String @id @default(cuid()) key String mime String size Int kind String ownerType String ownerId String uploadedById String createdAt DateTime @default(now()) }
model Activity { id String @id @default(cuid()) leadId String actorId String? type String body String? meta Json? createdAt DateTime @default(now()) }
model AuditLog { id String @id @default(cuid()) actorId String? action String entity String entityId String before Json? after Json? ip String? createdAt DateTime @default(now()) }
model WebhookEvent { id String @id provider String payload Json processedAt DateTime? }  // idempotency
```

Indexes: `Talent(status, tier)`, GIN on `searchVector`, trigram on `stageName`, `Lead(stage, ownerId)`, `Lead(eventDate)`, `Booking(talentId)`, `PaymentMilestone(status, dueDate)`.

## 5. Booking state machine

Lead stage transitions (server-enforced in `packages/utils/stateMachine.ts`):

| From | Allowed to | Guard |
|---|---|---|
| NEW | CONTACTED, LOST | owner set |
| CONTACTED | REQUIREMENT_RECEIVED, LOST | |
| REQUIREMENT_RECEIVED | SHORTLISTED, LOST | ≥1 booking with talent |
| SHORTLISTED | AVAILABILITY_CHECK, LOST | |
| AVAILABILITY_CHECK | QUOTE_SENT, SHORTLISTED, LOST | ≥1 booking availability ∈ {AVAILABLE, TENTATIVE} |
| QUOTE_SENT | NEGOTIATION, ADVANCE_PENDING, LOST | quote status SENT |
| NEGOTIATION | QUOTE_SENT, ADVANCE_PENDING, LOST | |
| ADVANCE_PENDING | CONFIRMED, CANCELLED | quote ACCEPTED |
| CONFIRMED | EVENT_COMPLETED, CANCELLED | **system only** — see below |
| EVENT_COMPLETED | SETTLEMENT | completion note |
| SETTLEMENT | CLOSED | payout PAID, balance PAID |

**Confirmation rule (system-triggered, never manual):**
```
quote.status == ACCEPTED
&& contract.status == SIGNED
&& advance milestone.status == PAID
&& booking.repAcceptedAt != null
→ booking.availability = CONFIRMED; lead.stage = CONFIRMED; emit booking.confirmed
```
Evaluated after each of those events (domain event handler).

## 6. Money rules
- All amounts `BigInt` paise. Percentages in basis points (`Int`).
- Rounding: half-up at line level for tax; totals = sum of rounded lines.
- `marginPaise = sellingTotal(excl. tax) − payoutTotal − internalCosts`.
- Quote needs approval if `talentFee < rateCard.minimumRate` or margin < configured floor.
- Serialization layer strips INTERNAL fields based on role (see §7).

## 7. Field-level visibility (enforced in API serializers, not UI)

| Field | CUSTOMER | TALENT/REP | SALES/TM/OPS | ACCOUNTS/SUPER_ADMIN |
|---|---|---|---|---|
| Fee band | ✓ | ✓ | ✓ | ✓ |
| Quote customer amounts | ✓ (own) | ✗ | ✓ | ✓ |
| Rate card min/selling | ✗ | ✗ | ✓ | ✓ |
| Payout amount | ✗ | ✓ (own) | ✗ (OPS ✗, TM ✓) | ✓ |
| Internal cost / margin | ✗ | ✗ | ✗ | ✓ |
| Customer phone/email | own | ✗ (until confirmed, then ops contact only) | ✓ | ✓ |

Implemented via response DTO classes per audience (`PublicTalentDto`, `CustomerBookingDto`, `TalentBookingDto`, `StaffBookingDto`, `FinanceBookingDto`) with tests asserting forbidden keys are absent.

## 8. Integrations

### Payments (Razorpay)
- Create Payment Link per milestone (`reference_id = milestone.id`).
- Webhook `POST /v1/webhooks/razorpay`: verify `X-Razorpay-Signature` with HMAC SHA256; store raw event in `WebhookEvent` (id = event id) for idempotency; enqueue processing job.
- Events: `payment_link.paid`, `payment.captured`, `payment.failed`, `refund.processed`.
- Nightly reconciliation job compares gateway settlements with `Payment` rows.

### E-sign
- `ESignProvider` interface: `createEnvelope(doc, signers)`, `getStatus(ref)`, `downloadSigned(ref)`, webhook verify. One adapter per provider.

### Messaging
- `MessagingProvider` interface: `sendSms`, `sendWhatsAppTemplate`, `sendEmail`. Templates versioned in DB/config; DLT template IDs for SMS.

### Storage
- Upload: API issues presigned PUT URL (max 25 MB, mime allowlist). Public media bucket via CDN; private bucket for contracts, KYC, proofs; reads via presigned GET (≤ 15 min).

## 9. Background jobs (BullMQ)
| Queue | Jobs |
|---|---|
| `notifications` | send email/SMS/WA, retries with backoff |
| `webhooks` | process payment/e-sign events |
| `documents` | render quote/invoice PDF |
| `reminders` | payment due, event T-3/T-1, stale-lead alerts (cron) |
| `reconcile` | nightly gateway reconciliation |
| `search` | refresh talent search vectors |

## 10. Security
- Helmet, strict CORS (web + admin origins only), CSRF protection on cookie-auth routes.
- Rate limits: OTP send 3/10 min per phone & IP; enquiry 5/hour per IP; login 10/15 min.
- RBAC via `@Roles()` guard + resource ownership checks (`@Owns('booking')`).
- MFA mandatory for all staff roles.
- Secrets in cloud secret manager; `mfaSecret`, KYC numbers encrypted at rest (AES-256-GCM, key from KMS).
- Admin app on separate domain; optional IP allowlist.
- Dependency scanning (Dependabot), `pnpm audit` in CI.
- PII minimisation: KYC stored as documents, not parsed numbers, unless required.

## 11. Environments
| Env | Purpose | Data |
|---|---|---|
| local | dev | seed data, Docker Postgres + Redis |
| staging | QA, pilot rehearsal | anonymised/seed, gateway test mode |
| production | live | real; gateway live mode |

Env vars documented in `.env.example` per app; validated at boot with Zod.

## 12. Testing strategy
- Unit: money utils, state machine, serializers (forbidden-field tests), quote calculations — ≥ 90% coverage on `packages/utils`.
- API e2e: full booking lifecycle with mocked gateway/e-sign.
- Web e2e (Playwright): search → enquiry; quote accept → pay (test mode); admin pipeline drag.
- Webhook replay tests (duplicate, out-of-order events).

## 13. Performance & scale targets
- Public catalogue pages: ISR (revalidate 5 min) + on-demand revalidation when talent updated.
- API p95 < 400 ms reads, < 800 ms writes.
- Postgres connection pooling (PgBouncer / Prisma Accelerate or Neon pooler).
