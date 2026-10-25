# Tasks — Talent & Celebrity Booking Platform

> Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked
> IDs map to requirements in `srs.md`. Estimates are for one full-stack dev (d = day).
> Order within a milestone is the recommended build order.

---

## Phase 0 — Discovery & UX (2–3 weeks)

### M0.1 Decisions
- [ ] T-001 Confirm brand name, domain, logo
- [ ] T-002 Confirm launch geography and 3–5 launch categories
- [ ] T-003 Confirm default commission %, service fee %, margin floor for approval
- [ ] T-004 Choose payment gateway (default Razorpay) and open merchant account
- [ ] T-005 Choose e-sign provider; get sandbox keys
- [ ] T-006 Choose SMS/WhatsApp provider; register DLT templates
- [ ] T-007 Legal: terms, privacy policy, cancellation/refund policy, booking contract template (lawyer)
- [ ] T-008 Tax: GST/TDS treatment of commission vs pass-through (CA)
- [ ] T-009 Sign first manager/agency partners; collect 30+ talent profiles

### M0.2 Design
- [ ] T-010 Design tokens + component library in Figma (`design.md` §3–4)
- [ ] T-011 Customer screens: home, listing, profile, enquiry, booking detail (mobile + desktop)
- [x] T-012 Admin screens: pipeline, lead workspace, quote builder, talent edit, dashboard  — _`apps/admin`: staff sign-in (password + authenticator), overview, pipeline board/table, lead workspace done; quote builder, talents, payments, payouts, contract send, settings (users & roles, invites, categories) and audit log done_
- [ ] T-013 Clickable prototype; 5 user tests (2 corporate, 2 planners, 1 private)

---

## Phase 1 — MVP (8–12 weeks build)

### M1.1 Foundation (week 1–2)
- [~] T-100 Turborepo + pnpm monorepo, apps `web`, `admin`, `api`, `worker`, packages `db`, `schemas`, `ui`, `config`, `utils` (1d)  — _done: `web`, `api` (core), `schemas`, `ui`, `config`, `utils`, `db`; pending: `worker` (`admin` scaffolded 2026-10-20)_
- [ ] T-101 Shared ESLint/Prettier/tsconfig, Husky + lint-staged, commitlint (0.5d)
- [x] T-102 Docker Compose: Postgres 16 + Redis (0.5d)  — _`docker-compose.yml`; host ports 5440/6390; `pnpm db:up` / `db:down`; `talent_test` DB for e2e_
- [x] T-103 GitHub Actions: lint, typecheck, test, build (0.5d)  — _`.github/workflows/ci.yml`: Postgres service, Prisma generate + migrate, then turbo lint/typecheck/test/build (simulated locally: all pass)_
- [x] T-104 Prisma schema v1 from `trd.md §4` + first migration + seed (2d)  — _`packages/db`: 23 tables, GIN/trigram indexes, `init` migration, seed = 8 talents + one lead per stage_
- [~] T-105 Zod env validation per app; `.env.example` (0.5d)  — _done for `web` (`lib/env.ts`, checked in next.config), `db` and `api` (`src/config/env.ts`); `worker` when it exists_
- [x] T-106 NestJS core: config, Prisma service, pino logger, global error filter, Zod pipe, request id (1d)  — _`apps/api`: `/v1` prefix, helmet, strict CORS, `GET /v1/health`; 9 e2e tests (Supertest + Docker DB); tsup production build_
- [x] T-107 `packages/utils`: money (paise, bps, formatINR, tax rounding) + tests (1d)
- [x] T-108 `packages/utils`: lead/booking state machine + tests (1d)  — _`packages/utils/src/stateMachine.ts`; 19 tests incl. every rejected move_
- [x] T-109 `packages/ui`: tokens, Tailwind preset, shadcn setup, base components (2d)  — _Tailwind v4 CSS tokens instead of a JS preset_
- [ ] T-110 Staging environments (web, admin, api, worker, DB, Redis, buckets) (1d)

### M1.2 Auth & users (week 2–3) — AUTH-1..5
- [x] T-120 OTP send/verify (provider adapter, rate limits) (1.5d)  — _`apps/api/src/auth`; console SMS adapter until a vendor is chosen; 5-min codes, 5 attempts, 30 s resend, 3/10 min per phone & IP_
- [x] T-121 Staff email/password login + TOTP MFA (1.5d)  — _scrypt passwords (`@repo/db`), mandatory TOTP with enrolment on first sign-in, AES-256-GCM secrets, replay block, 10/15 min lockout_
- [x] T-122 JWT access + rotating refresh cookie, logout (1d)  — _15-min HS256 access token; refresh in httpOnly SameSite=Strict cookie on /v1/auth; reuse of a rotated token revokes all sessions_
- [~] T-123 Roles guard, `@Public`, ownership guard (1d)  — _global sign-in guard + `@Public()` + `@Roles()` done; ownership guard comes with the first owned resources (bookings)_
- [x] T-124 Invite flow for talent/rep and staff (1d)  — _7-day single-use links (HMAC stored); staff accept with a password then MFA, talent/reps with a phone OTP; links talent/rep records; links returned (sending waits for the notifications worker)_
- [x] T-125 Admin: users & roles screen (1d)  — _admin Settings → Users & roles; invites tab + accept pages (admin for staff, website for talent/reps)_
- [x] T-126 Audit interceptor + `AuditLog` writes (1d) — AUD-1..3  — _interceptor logs every /admin mutation (incl. failures); services add before/after; secrets redacted; `GET /v1/admin/audit`_

### M1.3 Talent catalogue (week 3–5) — CAT, ADM
- [x] T-140 Categories CRUD (admin) (0.5d)  — _API `/v1/admin/categories`; can't delete one in use_
- [x] T-141 Talent CRUD API + admin form (profile, categories, tags, languages, cities, tier, status, representation) (2d)  — _admin `/talents`, `/talents/new`, `/talents/:id` (profile tab; publish / hide / draft)_
- [~] T-142 Media upload via presigned URLs, ordering, cover image (1.5d)  — _register/order/cover/remove done; presigned upload waits for the storage vendor (S3/R2)_
- [x] T-143 Rate cards (internal) UI + API (1d)  — _admin talent “Rate cards” tab_
- [~] T-144 Representatives CRUD, link to talents, KYC upload, verification status (1.5d)  — _CRUD, linking, verification done; KYC upload waits for storage_
- [x] T-145 Blackout dates (admin) (0.5d)  — _API `/v1/admin/talents/:id/blackouts`_
- [x] T-146 Public catalogue API: list, filters, full-text search, pagination (2d)
- [x] T-147 Serializer tests: public talent DTO has no rate card fields (0.5d)  — _mock + NestJS: strict-schema parse and leak checks on every catalogue route_
- [x] T-148 Web: listing page with filters (desktop rail, mobile sheet) (2d)  — _UI done; runs on the real API (`NEXT_PUBLIC_API_BASE=/api/v1`)_
- [x] T-149 Web: talent profile page with sticky CTA, fee band, disclaimer (2d)  — _UI done; runs on the real API (`NEXT_PUBLIC_API_BASE=/api/v1`)_
- [x] T-150 Web: home page (1.5d)  — _UI done; runs on the real API (`NEXT_PUBLIC_API_BASE=/api/v1`)_
- [x] T-151 Web: SEO city/category landing pages, metadata, JSON-LD, sitemap (1.5d)  — _UI done; runs on the real API (`NEXT_PUBLIC_API_BASE=/api/v1`)_
- [x] T-152 Favourites (0.5d)  — _UI done; runs on the real API (`NEXT_PUBLIC_API_BASE=/api/v1`)_
- [ ] T-153 CSV bulk import of talents (SHOULD) (1d)

### M1.4 Enquiry & pipeline (week 5–7) — ENQ, PIPE, AVL
- [~] T-160 Enquiry API: create lead + draft bookings, ref number, Turnstile (1.5d)  — _`POST /v1/enquiries` done (OTP-verified, signs the customer in, TB-/BK- refs from Postgres sequences, 5/hour/IP); Turnstile waits for keys_
- [x] T-161 Web: enquiry stepper with OTP, success page (2d)  — _UI done; runs on the real API (`NEXT_PUBLIC_API_BASE=/api/v1`)_
- [ ] T-162 Acknowledgement notifications (worker + templates) (1d)
- [x] T-163 Admin: pipeline Kanban + table views, filters (2.5d)  — _API done: `GET /v1/admin/leads` (stage/owner/city/category/date/q filters) and `/v1/admin/pipeline/board`; admin board + table done_
- [x] T-164 Stage transition endpoint using state machine; lost reason; activity log (1d)
- [x] T-165 Admin: lead workspace (brief, bookings per talent, activity, notes) (2.5d)  — _API done (`GET /v1/admin/leads/:id`, notes, owner, add/remove talent); admin workspace done (stage moves, availability, rep acceptance, add/remove talent, start time, notes, activity)_
- [x] T-166 Availability status per booking + rep acceptance capture (1d)  — _plus the automatic confirmation check (`PipelineService.evaluateConfirmation`); M1.5/M1.6 must call it after quote accept, contract sign and advance paid_
- [x] T-167 Auto-assign owner round robin (SHOULD) (0.5d)  — _sales user with the fewest open leads_
- [ ] T-168 Follow-up tasks/reminders (SHOULD) (1d)

### M1.5 Quotes (week 7–8) — QUO
- [x] T-180 Quote model, versions, line items, tax calc, milestone plan (1.5d)  — _`packages/utils/src/quote.ts` + `/v1/admin/bookings/:id/quotes`_
- [x] T-181 Admin quote builder with rate card hints, live totals, margin (finance only) (2.5d)  — _`apps/admin` `/bookings/:id/quotes`: versions, editor with live totals (same `calculateQuote`), role-aware payout/cost/margin columns, send, super-admin approve/return_
- [x] T-182 Approval rule (below minimum / margin floor) + approval action (1d)  — _floor `QUOTE_MARGIN_FLOOR_BPS` (placeholder 10% until the client decides)_
- [ ] T-183 Quote PDF render in worker (1d)
- [~] T-184 Send quote: email/WA with secure link (0.5d)  — _send action + lead → QUOTE_SENT done; delivery waits for the worker and email/WhatsApp vendor_
- [x] T-185 Web: quote view, accept (IP + timestamp), request changes, expiry (1.5d)  — _runs on the real API_
- [x] T-186 Serializer tests: customer quote DTO has no internal cost (0.5d)  — _API e2e parses the strict `CustomerBookingSchema` and checks for leaked fields_

### M1.6 Contracts & payments (week 8–10) — CON, PAY
- [ ] T-200 Documents module: private bucket, presigned GET (0.5d)
- [~] T-201 Contract: upload PDF or generate from simple template; send via e-sign adapter (2d)  — _send/void via `ESignProvider` (fake adapter); PDF template + upload wait for the worker and storage_
- [~] T-202 E-sign webhook, status tracking, signed PDF storage (1d)  — _`POST /v1/webhooks/esign`: HMAC, idempotent, forward-only status; signed-PDF storage waits for T-200_
- [x] T-203 Payment milestones from accepted quote (0.5d)
- [~] T-204 Gateway adapter: payment link per milestone (1d)  — _`PaymentGateway` interface + fake adapter; one reusable link per milestone, advance first; real adapter waits for the vendor_
- [~] T-205 Gateway webhook: signature verify, idempotency, worker processing (1.5d)  — _`POST /v1/webhooks/payments` done (HMAC, `WebhookEvent` claim, partial/duplicate payments); processed inline until the worker exists_
- [~] T-206 Manual payment entry with proof (Accounts) (0.5d)  — _done with UTR reference; proof upload waits for storage_
- [~] T-207 Receipts + payment reminders (1d)  — _receipt numbers (RC-…) issued on payment; emails and reminders wait for the worker + messaging vendor_
- [~] T-208 Confirmation rule handler → CONFIRMED + notifications (1d)  — _runs after quote accepted, contract signed, milestone paid, rep accepted; notifications wait for the worker_
- [x] T-209 Webhook replay/duplicate tests; full-lifecycle e2e test (1.5d)  — _`apps/api/test/payments.e2e.test.ts`_

### M1.7 Customer dashboard & talent portal (week 10–11) — CUS, TAL
- [~] T-220 Web: account bookings list (1d)  — _UI done on mock; API done (`GET /v1/me/bookings`); web switched (real mode: `NEXT_PUBLIC_API_BASE=/api/v1`)_
- [~] T-221 Web: booking detail with status timeline, action card, tabs (2d)  — _UI done on mock; API done (`GET /v1/me/bookings/:ref`, decision, pay); web switched_
- [~] T-222 Talent portal: my bookings, my payouts, blackout dates (1.5d)  — _UI done on mock; API done (`/v1/portal…`, talent + rep logins, admin `blackoutSelfEdit` switch); web switched_
- [x] T-223 Serializer tests: talent DTO has payout only, no selling price/margin (0.5d)  — _`apps/api/test/portal.e2e.test.ts` (strict schemas + leak checks)_

### M1.8 Ops, settlement, analytics (week 11–12) — OPS, SET, ANA
- [x] T-240 Ops checklist on booking (SHOULD) (1d)  — _API done (`PUT /v1/admin/bookings/:id/ops`; reporting time + contact shown in the talent portal); admin checklist dialog on confirmed / accepted bookings_
- [x] T-241 Mark completed; cancellation flow with reason (1d)  — _completion creates payouts; cancellation stores reason + policy ref, closes unpaid milestones/unsigned contracts, flags paid money for refund review (refunds manual, PAY-6)_
- [x] T-242 Payout records + mark paid (Accounts) (1d)
- [x] T-243 Margin calculation on confirmation/settlement (0.5d)  — _stored at acceptance, finalised when the payout is paid_
- [~] T-244 Analytics dashboard: pipeline, GMV, conversion, time-to-confirm, receivables, pending payouts (2d)  — _API done (`GET /v1/admin/analytics`, finance block for ACCOUNTS/SUPER_ADMIN); admin overview done (date range + my leads; full filter UI pending)_
- [ ] T-245 Event reminders T-3/T-1, feedback request (0.5d)
- [ ] T-246 Nightly reconciliation job (1d)

### M1.9 Hardening & launch prep
- [~] T-260 Security review: OWASP checklist, rate limits, headers, CORS, MFA enforcement (1.5d)  — _done: MFA now enforced in the session (phone-code sessions can't carry staff roles), origin checks on the proxies, headers/CSP, admin IP allowlist, Dependabot + `pnpm audit` (4 high advisories fixed via overrides); pending: global per-IP limit (needs the Redis client), external pen test. See `docs/runbook.md`_
- [x] T-261 Accessibility pass (axe + manual) (1d)  — _axe WCAG 2.1 AA on 13 website pages + 13 admin pages, desktop and phone: fixed every real failure (faded text below AA in How It Works and the talent portal, one muted lead); one reviewed false positive (breadcrumb under the fixed navbar while axe scrolls); admin skip link added_
- [~] T-262 Performance pass: LCP, image optimisation, ISR (1d)  — _throttled phone (4G-like, 4× CPU): listing CLS 0.659 → 0 and SEO links in HTML (server fallback), enquire LCP 3.6 s → 1.1 s, −20 KB JS (lazy calendar), ISR 5 min + on-demand revalidation from the API. Hero-image LCP still ~4 s: bandwidth/JS-bound (~400 KB JS, 147 KB fonts); next levers are client-side Zod/motion weight and font subsetting_
- [x] T-263 Backups + restore drill (0.5d)  — _`scripts/db-backup.sh`, `scripts/db-restore-drill.sh`; drill passed on dev 2026-10-20_
- [~] T-264 Sentry, uptime monitoring, alerting (0.5d)  — _`GET /v1/health` checks the DB for uptime monitors; Sentry waits for an account_
- [~] T-265 Legal pages live; consent capture on forms (0.5d)  — _placeholder legal copy + consent checkbox; awaiting T-007 lawyer text_

---

## QA & Pilot (2–4 weeks)
- [ ] T-300 UAT script covering full booking cycle; fix list
- [ ] T-301 Onboard pilot managers; load real talent profiles
- [ ] T-302 Gateway + e-sign live mode
- [ ] T-303 Run N controlled bookings end-to-end (N set in T-003)
- [ ] T-304 Pilot review: KPIs, ops bottlenecks → Phase 2 backlog
- [ ] **GATE 1:** full cycle (onboarding → enquiry → quote → payment → event → settlement) reliable in live bookings

---

## Phase 2 — Management platform (backlog)
- [ ] T-400 Rep/talent self-service: accept / reject / counter quote
- [ ] T-401 Media kit, rider, fee band edits with admin approval
- [ ] T-402 Real-time calendar sync (Google/Outlook) where authorized
- [ ] T-403 Contract template engine with clause library and versions
- [ ] T-404 GST tax invoices
- [ ] T-405 Automated payouts (e.g. RazorpayX), settlement statements
- [ ] T-406 Commission calculation engine per rate card
- [ ] T-407 Refunds via gateway API + policy calculator
- [ ] T-408 WhatsApp automation flows
- [ ] T-409 Event operations module (travel, hotel, rider)
- [ ] T-410 Reviews & ratings
- [ ] T-411 Dispute workflow
- [ ] **GATE 2:** booking operations stable

## Phase 3 — Corporate & influencer (backlog)
- [ ] T-500 Organisations, members, approval chains
- [ ] T-501 Multi-talent requirement → options comparison for corporates
- [ ] T-502 Consolidated billing, corporate membership plans
- [ ] T-503 Campaigns: creation, creator selection, deliverables, draft approvals
- [ ] T-504 Social metrics ingestion, post URLs, reach/engagement reports
- [ ] T-505 Brand dashboard

## Phase 4 — Intelligence & scale (backlog)
- [ ] T-600 AI brief parser → structured filters → ranked shortlist (human verification)
- [ ] T-601 Automated quote suggestions
- [ ] T-602 Recommendations
- [ ] T-603 Multi-city teams, agency accounts
- [ ] T-604 Public API + API keys
- [ ] T-605 React Native apps (customer, talent)
- [ ] T-606 Advanced analytics
