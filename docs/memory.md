# Memory — Project Context Log

> Living file. **Read at the start of every session; update at the end.**
> Keep it short and current: facts, decisions, status, gotchas. Detail lives in the other docs.

---

## 1. Project snapshot
- **What:** India-first *managed* talent booking platform — marketplace + booking engine + talent CRM (+ influencer campaigns later).
- **Who books:** corporates, event/wedding planners, brands/agencies, colleges/hotels/malls, private customers.
- **Model:** Request to Book / Check Availability → verify with rep → quote → contract → advance → confirmed → event → settlement.
- **Revenue:** margin/commission 10–25%, service fee 5–10%, campaign mgmt, retainers, featured profiles.
- **Current phase:** Phase 0/1 — clickable frontend (`apps/web`) on mock data; backend not started.
- **Docs:** `prd.md` · `srs.md` · `trd.md` · `architecture.md` · `design.md` · `rules.md` · `task.md`

## 2. Stack (locked unless a decision below changes it)
Turborepo + pnpm · Next.js 15 (web, admin) · NestJS 11 (api, worker) · Prisma + PostgreSQL 16 · Redis + BullMQ · S3/R2 · Tailwind + shadcn/ui · Zod shared schemas · TanStack Query · Vitest/Supertest/Playwright · GitHub Actions · India region hosting.

## 3. Non-negotiables (short form — full list in `rules.md §0`)
- Confirmation is system-derived: quote accepted + contract signed + advance paid + rep accepted.
- Margin/rate cards never reach customer or talent responses.
- Money = paise `BigInt`; % = bps `Int`.
- No "Book Now", no exact public fees.

## 4. Decisions log
| Date | Decision | Why | Ref |
|---|---|---|---|
| 2026-10-16 | Merge two Sept 2026 drafts into one plan; 5 phases with 2 gates | Single source of truth | Plan doc |
| 2026-10-16 | Modular monolith (NestJS), separate admin app | Small team, transactional money flows | ADR-1, ADR-2 |
| 2026-10-16 | Web/PWA first, native apps Phase 4 | Speed to pilot | ADR-7 |
| 2026-10-16 | Postgres full-text search for MVP | No extra infra | ADR-5 |
| 2026-10-16 | Provider adapters for payment/e-sign/messaging | Vendors not yet chosen | ADR-6 |
| 2026-10-16 | Build `apps/web` frontend first on mock data via typed `lib/api/*` (fake latency) | Validate UX before backend; swap to NestJS later without UI changes | Frontend brief |
| 2026-10-16 | Add libs outside trd §1: `motion`, `gsap` (+ScrollTrigger), `lenis`, `lucide-react`, `next-themes`, `react-day-picker`, `canvas-confetti`, `sonner`, `vaul`, `@date-fns/tz` | Motion/scroll system + UI primitives requested in brief; all MIT, maintained | Frontend brief |
| 2026-10-16 | No Lottie — empty-state loops in CSS/SVG | Smaller bundle, no extra dep | Frontend brief |
| 2026-10-16 | Tailwind v4 (CSS-first `@theme`); tokens shipped as CSS from `packages/ui` | shadcn/ui current default; no JS preset needed | Frontend brief |
| 2026-10-16 | Display font Cabinet Grotesk variable (Fontshare FFL, self-hosted), fallback Inter Tight 800; body Inter; accent italic serif Instrument Serif | Brief needs 800–900 weights; Clash Display tops out at 700; Neue Montreal is paid | Frontend brief |
| 2026-10-16 | Hero H1 "BOOK THE TALENT. / WE HANDLE THE REST."; design.md headline used as sub-copy | Brief overrides design.md §6.1 headline (accepted at "go") | Frontend brief |
| 2026-10-16 | Availability labels follow design.md §4 table (covers all 7 statuses) | srs AVL-2 lacks TENTATIVE and differs on NOT_CHECKED | Frontend brief |
| 2026-10-16 | Mock "Pay" opens a gateway hand-off only; never mutates payment state client-side. CONFIRMED appears only in seeded data | Golden rules 1 & 4 | Frontend brief |
| 2026-10-16 | Dev-only session switcher (guest/customer/talent) stands in for OTP auth | No backend yet | Frontend brief |
| 2026-10-16 | Placeholder brand name kept in one constant; `/compare` (CAT-9) deferred; paid placements tagged "Featured" | Brand undecided; not in brief page list; design.md §6.1 | Frontend brief |
| 2026-10-19 | State machine guards: trd §5 lists "quote status SENT" on the QUOTE_SENT row; applied as "entering QUOTE_SENT/NEGOTIATION needs a SENT quote" and "entering ADVANCE_PENDING needs an ACCEPTED quote". LOST/CANCELLED need a reason; SETTLEMENT a completion note; CLOSED needs payout + every milestone PAID | Row guards were ambiguous about entering vs leaving a stage | trd §5, PIPE-5, OPS-5 |
| 2026-10-19 | API uses explicit `@Inject()` for every constructor dependency (no `emitDecoratorMetadata`); tsx in dev, Vitest in tests, tsup bundle in prod | esbuild-based tools can't emit decorator metadata; workspace packages ship TS source | T-106 |

## 5. Open questions
- [ ] Brand name / domain
- [ ] Launch geography (single city/region vs pan-India)
- [ ] Launch categories (proposed: singers, DJs, comedians, anchors/speakers, creators)
- [ ] Commission %, service fee %, margin floor for approval — _margin floor is a placeholder 10% (`QUOTE_MARGIN_FLOOR_BPS`)_
- [ ] Payment gateway (assumed Razorpay) · e-sign vendor · SMS/WA vendor
- [ ] Pilot target N bookings
- [ ] MVP budget ceiling and team size
- [ ] Legal/tax: GST on commission vs pass-through, TDS, intermediary status, DPDP compliance
- [ ] Availability label wording: design.md §4 vs srs AVL-2 disagree (NOT_CHECKED "Request received" vs "Checking availability"; AVL-2 has no TENTATIVE). Using design.md for now — confirm.
- [ ] Hero headline: design.md §6.1 vs frontend brief. Using brief's line as H1 — confirm with brand work.
- [ ] Final display font licence check once brand is locked (Cabinet Grotesk placeholder).
- [ ] CAT-11 says only verified-rep talent appear publicly, yet CAT-2 has a "verified only" filter (implies unverified ones are listed). Mock shows 4 unverified talents (no badge) — confirm which rule wins.
- [ ] Brief asked for 6 sample bookings covering every availability status; there are 7 statuses, so the mock has 7 bookings (one per status) — confirm OK.
- [ ] Showreels: no licensed video yet; profiles show "Showreel shared on request" — confirm approach.
- [ ] Demo OTP is fixed `123456`; real OTP provider still undecided (see vendor question).

## 6. Status
| Area | State | Notes |
|---|---|---|
| Planning docs | Done (v1.0) | 16 Oct 2026 |
| Design | In code (no Figma) | Tokens + components in `packages/ui`; motion system in `apps/web/lib/motion` |
| Repo / foundation | Partial | Turborepo + pnpm; `apps/web`, `packages/{schemas,ui,utils,config,db}`; Docker Postgres + Redis; state machine in `packages/utils` |
| Web frontend | Clickable on mock API | Home, listing, category, city/category SEO, profile, enquiry, account, booking detail, favourites, talent portal, content/legal, 404/error |
| Backend | Core ready | `packages/db` (schema, migration, seed); `apps/api` NestJS core with health check + e2e tests. M1.2 done in the API; public catalogue API live (T-146/147). `apps/web` uses it when `API_URL` is set (catalogue only; rest still mock). Admin catalogue API done (T-140…145; uploads wait for a storage vendor). Enquiry & pipeline API done (M1.4: T-160 minus Turnstile, T-163…167; admin UI pending). Quotes API done (M1.5: T-180/182/186, T-181/184/185 API parts; PDF + delivery wait for the worker). Contracts & payments core done (M1.6) on fake gateway/e-sign adapters; real adapters, PDFs, storage and notifications wait for vendors + the worker. Customer + talent portal APIs done (M1.7 API side). apps/web runs on the real API in real mode (`NEXT_PUBLIC_API_BASE=/api/v1` + `API_URL`); the mock stays the default for demos. M1.8 API done (ops checklist, completion → payouts, cancellation, payouts, margin, analytics); reminders + reconciliation (T-245/246) wait for the worker and vendors. apps/admin started (sign-in, overview, pipeline, lead workspace). apps/admin covers every staff API (settings + audit done 2026-10-20). Lead-workspace gaps closed (add/remove talent, start time, ops checklist). M1.9 in progress: security review fixes, backups + restore drill done (see docs/runbook.md). Accessibility pass done; performance pass done except hero-image LCP (~4 s on throttled 4G). Remaining M1.9: global rate limit (Redis), Sentry, pen test, legal copy. `lib/api` transports swap later (`NEXT_PUBLIC_API_BASE`) |
| Integrations | Not started | Blocked on vendor choice |

## 7. Glossary
Lead = enquiry pipeline record · Booking = one talent at one event · Rep = authorized manager/agency · Fee band = public indicative range · Milestone = scheduled payment part · Payout = amount owed to talent · Margin = selling − payout − costs (internal).

## 8. Gotchas / learnings
_(add as they happen — e.g. gateway webhook quirks, DLT template rejections, Prisma BigInt JSON serialisation)_
- Prisma `BigInt` doesn't serialise to JSON by default → convert in DTO layer (string or number-safe).
- Money on the wire = paise as decimal **strings**; `PaiseSchema` parses to `bigint`. `toWire()` in the mock router mirrors this.
- Customer/talent DTO schemas are `z.strictObject` — a leaked internal field makes parsing throw (caught by `apps/web/lib/mock/serializers.test.ts`).
- Mock data lives server-side only (`lib/mock/*` is `server-only`); the browser talks to `/api/mock/*`, so raw margin/payout never ships in a JS bundle. Regenerate with `pnpm mock:generate`.
- Mock state is in-memory on `globalThis` — resets on server restart.
- Card → profile morph uses the View Transitions API: the clicked card's image gets `view-transition-name: talent-hero` only at click time (names must be unique per page). Falls back to the curtain wipe.
- Curtain wipe never runs on first load (would cover SSR HTML before hydration).
- `.text-outline` needs `--stroke-color` (text colour is transparent, so `currentColor` can't be used).
- Local machine: repo sits on an NTFS/FUSE mount → `pnpm install` ~30 min and builds are I/O-bound; git needed `safe.directory`. pnpm ignored `${HOME}`-based `store-dir`/`virtual-store-dir` in `.npmrc`, so those were removed.
- npm registry is slow from this network (~450 KB/s); pinned known majors instead of newest (TS 5.9, ESLint 9, Motion 12, react-day-picker 9, Next 15.5).
- Playwright's old `chrome-headless-shell` never fires `requestAnimationFrame` over CDP, so Motion/Lenis animations look frozen there. Use `--virtual-time-budget=20000 --screenshot` for visual checks, or a full Chrome for e2e.
- Never branch markup on `useReducedMotion` from `motion/react` directly — use `@repo/ui/lib/use-reduced-motion` (false until mounted). The raw hook caused React hydration error #418 for reduced-motion users.
- Above-the-fold headlines (`SplitText trigger="mount"`) animate with CSS (`.split-rise`), not Motion, so they paint before hydration (LCP).
- Images: Unsplash/imgix does resizing + AVIF/WebP (`auto=format`) through `lib/image-loader.ts`; `deviceSizes` capped at 1920. Every `<Image>` needs a `sizes` that matches its real layout width. Cover images carry an ~90-byte WebP `blurDataURL` made by `pnpm mock:generate` (needs ImageMagick `magick`; skipped if missing). Hero mosaic is greyscaled server-side (`sat=-100`), not with a CSS filter.
- No native `<select>`/`<input type=date>` in the UI: use `@repo/ui/select` (Radix; `emptyLabel` maps an "Any …" option to `''` via an internal sentinel, since Radix items can't have empty values) and `@repo/ui/date-picker` / `@repo/ui/calendar` (values are `YYYY-MM-DD`, built from local date parts). In RHF forms wire them through `Controller`.
- Calendar: don't enable react-day-picker's built-in `animate` — it overlays a cloned old month (month names/numbers overlap). `@repo/ui/calendar` animates the new caption/grid in place instead.
- Full-screen overlays (mobile menu) must render their own close button: the header's toggle sits inside the header's z-50 stacking context, under the overlay. Keep decorative glows inside a clipped layer or the overlay scrolls sideways on phones.
- Header data (category images/counts, featured act) comes from `lib/nav.ts` (server, static-safe) and is passed to `<SiteHeader nav>` by layouts.
- Unsplash placeholder IDs were checked to resolve (HTTP 200) and reviewed visually; one with a recognisable celebrity DJ helmet and one brand logo were excluded.

- Local services: `pnpm db:up` (Docker). Host ports are **5440** (Postgres) and **6390** (Redis) because 5432/5433/6379 are taken by other local projects; override with POSTGRES_PORT / REDIS_PORT. `packages/db/.env` holds DATABASE_URL (git-ignored; copy from `.env.example`).
- Postgres extensions (pg_trgm, unaccent) are created by the Prisma migration, not the Docker init script — otherwise `migrate dev` sees drift and wants a reset. Prisma refuses `migrate reset` from an AI agent without the user's explicit consent.
- API (`apps/api`): always inject with `@Inject(Token)` — without decorator metadata Nest can't infer constructor types. `@prisma/client` must stay a direct dependency of `apps/api` and external in tsup (it can't be bundled). Port 4000 is taken by another local program here: set `PORT` in `apps/api/.env`.
- **Never pass `talent_dev` or `talent_test` as `--shadow-database-url`**: Prisma wipes its shadow database. Use a throwaway database (e.g. `createdb talent_shadow`) for `migrate diff`. Happened once on 2026-10-19 (dev seed data was restored by re-seeding).
- Auth: every API route needs sign-in unless marked `@Public()`. OTP codes are read in e2e tests from `ConsoleSmsSender.lastCode()`. API e2e tests use the `talent_test` database (`test/support/app.ts`, `TEST_DATABASE_URL`) and delete what they create.
- **Zod 4 gotcha:** `.partial()` keeps `.default()`s, so a PATCH schema built that way silently resets omitted fields. Use `patchOf()` from `packages/schemas/src/admin.ts` for every update schema.
- Publishing a talent is checked server-side (4–6 photos, category, tagline, bio, languages, event types) so a live profile always satisfies `PublicTalentSchema`; edits to a live profile are re-checked.
- Web → API migration switch (`apps/web/lib/api/server.ts`): set `API_URL` (e.g. http://localhost:4011) and server-rendered `/talents…` calls go to NestJS; other domains stay on the mock until their API modules exist. `httpTransport` unwraps the API's `{ data }` / `{ data, meta }` envelope.
- Talent search: a DB trigger (migration `catalogue_search`) keeps `Talent.searchVector` current; search = full-text (`simple` config + unaccent) OR partial/trigram name match.
- Admin routes live under `/v1/admin/*`; the audit interceptor records any mutating request whose route contains `/admin/`, so keep admin endpoints under that prefix.
- Dev staff sign-in after `pnpm --filter @repo/db seed`: any `@booktheinfluencer.local` staff email (e.g. admin@…) with password `dev-staff-password-2026`; the first sign-in returns an authenticator setup (add the secret to any authenticator app). Seed data only — never used in production.
- Fixed 2026-10-19: `IndianMobileSchema` used to strip a leading `91` from every number, so real numbers like 9123456789 were rejected. It now strips +91/91/0 only when the input has the extra digits.
- Lead/booking refs come from Postgres sequences `lead_ref_seq` / `booking_ref_seq` (start 1000; seed uses …000101+). Use `nextLeadRef`/`nextBookingRef` in `apps/api/src/pipeline/refs.ts` inside the same transaction.
- **CONFIRMED is reached only through `PipelineService.evaluateConfirmation(bookingId)`** (idempotent). Quote acceptance, contract signing and advance-payment handlers (M1.5/M1.6) must call it after their write, as rep acceptance already does.
- **Fixed 2026-10-20: API e2e tests had been running against `talent_dev`.** `PrismaService` used Prisma's own `.env` loading (packages/db/.env → dev) and the test helper fell back to `process.env.DATABASE_URL`, which Prisma had already filled. Now `PrismaService` takes `env.DATABASE_URL`, and tests read only `TEST_DATABASE_URL` and refuse any database not named `*_test`. Dev leftovers were removed; seed data was intact.
- Quotes: money on staff and customer responses is paise as decimal strings. Payout is visible/writable only by TALENT_MANAGER/ACCOUNTS/SUPER_ADMIN, internal cost and margin only by ACCOUNTS/SUPER_ADMIN; other roles' edits keep those values by line `id` (sending a hidden field = 403). A version is editable only while DRAFT/PENDING_APPROVAL, and any edit clears approval. Approving sends it.
- Quote acceptance creates the PaymentMilestones from the plan (first = advance) and calls `evaluateConfirmation`. M1.6 contract-signed and advance-paid handlers must call it too.
- `Lead.startTime` is optional (the brief form doesn't ask); staff set it via `PATCH /v1/admin/leads/:id/brief`. `BookingEventSchema.startTime` is nullable, and `formatTime(null)` → "Time to be confirmed".
- Payments/e-sign use provider interfaces (`PAYMENT_GATEWAY`, `ESIGN_PROVIDER`) with `fake` adapters only; env validation refuses `fake` in production. Webhooks are `POST /v1/webhooks/{payments,esign}`: hex HMAC-SHA256 of the raw body (`rawBody: true` in bootstrap), event id in a header, stored once in `WebhookEvent` as `<provider>:<id>` and claimed via `processedAt` (`common/webhooks.ts`). Processing is inline until `apps/worker` exists.
- A milestone is PAID only when captured payments cover its amount (partial payments add up; extra payments are kept and flagged `payment_duplicate` for a refund). Receipt numbers come from `receipt_seq` (RC-…). `Payment` → milestone is `onDelete: Restrict`, so test cleanup deletes payments first.
- The fake gateway's checkout links (`WEB_BASE_URL/dev/checkout/:id`) have no page yet; simulate a payment by posting a signed webhook.
- Talent portal: a TALENT login is linked by `Talent.userId` (set by accepting an invite); a REP login sees the talents of its `Representative`. The portal shows the first linked talent (by name); a rep with several talents only gets the first in profile/blackouts until the web portal has a talent switcher. Bookings still `NOT_CHECKED` or on LOST leads are hidden. Blackout self-edit needs `Talent.blackoutSelfEdit` (admin PATCH).
- Customer and talent views share `toBookingEvent()` (`apps/api/src/quotes/booking-event.ts`); event titles use `EVENT_TYPE_LABELS` ("Corporate event · Acme Tea").
- **Web real-API mode (BFF):** the browser calls `/api/v1/*` on the web origin (`app/api/v1/[...path]/route.ts`), which proxies to `API_URL/v1`. Tokens live in httpOnly cookies on the web origin (`tp_at` access, ~15 min; `tp_rt` refresh), never in JS. The proxy adds the bearer token, refreshes once on 401, forwards the visitor IP (`X-Forwarded-For`) for the API's rate limits, and maps web-only paths: `GET /session` (from `/users/me` + `/portal`), `POST /session/otp|verify|logout`, `POST /otp`. Enquiry and OTP-verify responses have their tokens stripped. `middleware.ts` renews an expired access token before a page renders (Server Components can't set cookies). Staff-only accounts are guests on the website.
- Website contact form → `POST /v1/contact` (stored as `ContactMessage`, CT-… ref, 5/hour/IP); the staff email alert waits for messaging. Favourites → `/v1/me/favourites`.
- Settlement: moving a lead to EVENT_COMPLETED creates a `Payout` (PENDING) per confirmed booking for `Booking.payoutTotalPaise`; Accounts can schedule, adjust (reason required) and mark it paid, which stores the final `Booking.marginPaise` = accepted quote subtotal − actual payout − internal cost. CANCELLED: unpaid milestones → CANCELLED, unsigned contracts → VOID, open payouts → ON_HOLD, paid money → `refund_review` activity; a signed contract stays as evidence.
- Analytics GMV = sum of `sellingTotalPaise` (incl. GST) of confirmed, non-cancelled bookings in leads created in the range. No margin % is reported (GMV includes tax; a % of it would mislead).
- Lifecycle test helpers: `apps/api/test/support/lifecycle.ts` (`acceptedBooking`, `confirmedBooking`, `signedWebhook`, `cleanupLifecycle`).
- **apps/admin** (Next.js, port 3001, `API_URL` required at runtime, no mock mode): same BFF pattern as the website, but cookies `adm_at`/`adm_rt` are SameSite=Strict and the refresh cookie is a browser-session cookie. `/api/v1/session/login` (password) → `/session/mfa` (authenticator code; first sign-in returns the setup key). Non-staff accounts are refused and their session ended. `middleware.ts` sends any page without a session to `/login?next=…`. The env check is skipped during `next build` (it never calls the API) so CI needn't set `API_URL`, which would also switch the website's catalogue.
- Admin quote builder sends `payoutRupees` only for TM/finance and `internalCostRupees` only for finance; new versions start from the latest version's lines *with their ids* so hidden values carry over (API `reconcile`). Totals are computed client-side with the same `calculateQuote` the API uses.
- Admin talent photos: previews load from the website origin (`NEXT_PUBLIC_WEB_URL`, default localhost:3000) because keys are site paths; adding a photo registers an existing path/URL until the storage vendor brings uploads. Detail tabs are in the URL (`?tab=photos`).
- `GET /v1/admin/milestones?view=due|overdue|paid|all` is the collections list; "overdue" is computed (unpaid and due date before today, IST) because no job sets `OVERDUE` yet. Admin money inputs go through `parseRupees` (exact string → paise; never floats).
- Invites: staff invites link to the admin app (`STAFF_INVITE_BASE_URL`, `/invite/:token`, set a password; authenticator at first sign-in); talent/rep invites link to the website (`INVITE_BASE_URL`, `/invite/:token`): the page shows the masked number, `POST /v1/invites/:token/code` texts the invited phone, accept signs them in (the web proxy captures the tokens like for enquiries). Until messaging exists, the admin shows the link to copy.
- Admin stage names are staff wording (`lib/roles.ts` STAGE_NAMES); `@repo/utils` STAGE_LABELS are customer copy.
- Seeded staff have no authenticator yet: the first admin sign-in shows the setup key. To re-test enrolment, clear `mfaSecret`, `mfaEnabledAt`, `mfaLastStep` on the user.
- **Fixed 2026-10-20 (security):** phone-code sign-in (and the enquiry / talent-invite auto sign-in) used to issue sessions with *all* of the account's roles, so a staff account with a phone could get staff access without password + MFA. Sessions now carry `amr` (`mfa`|`otp`), stored on `RefreshToken.authMethod` and kept across rotation; `sessionRoles()` strips staff roles from non-MFA sessions, and `verifyAccess` strips them again (defence in depth). Only `/auth/mfa/verify` issues `mfa` sessions.
- API e2e files run in parallel and enquiries auto-assign the SALES user with the fewest open leads, so a test's fresh staff could be picked by another file mid-cleanup (FK error → 409, the old intermittent failures). Every cleanup now starts with `retireStaff()` (soft-delete + no roles); analytics tests filter by an OPS owner.
- `pnpm.overrides` in the root package.json pin patched `postcss`, `effect`, `deepmerge-ts` (transitive via Next and the Prisma CLI) so `pnpm audit --prod --audit-level high` passes in CI; drop them once upstream versions include the fixes.
- `<Suspense>` around a client view that calls `useSearchParams()` drops it out of the static HTML. Always give such pages a server-rendered fallback with the same layout (`ListingFallback`, `EnquiryFallback`), or the content jumps in after JS (CLS) and search engines miss it.
- On-demand ISR: the API's `RevalidateWebInterceptor` (admin catalogue controller) POSTs to the website's `/api/revalidate` with `x-revalidate-secret` after any successful catalogue change; set `WEB_REVALIDATE_URL` + `REVALIDATE_SECRET` on the API and the same `REVALIDATE_SECRET` on the website. Catalogue pages also revalidate every 5 minutes.
- The date picker lazy-loads its calendar (react-day-picker + date-fns) on first open; YYYY-MM-DD helpers live in `@repo/ui/lib/iso-date`.
- Accessibility rule of thumb from the axe pass: never fade a block containing text with `opacity-*` to show "inactive"/"past" — use a quieter title colour, label or border instead.
- The enquiry consumes the OTP before creating the lead; a failed write means the customer requests a new code.
- API e2e test fixtures that create PUBLISHED talents must satisfy the public schema (languages, event types, tagline, bio, 4 photos) — the catalogue test parses every published talent in the test DB.
- pnpm isn't on PATH here: use `npx --yes pnpm@9.15.9 …`. Run the seed through `pnpm --filter @repo/db seed` (calling `prisma db seed` directly can't find `tsx`).

## 9. Session log
| Date | Who | What changed |
|---|---|---|
| 2026-10-16 | Planning | Created all docs v1.0 |
| 2026-10-16 | Claude (frontend) | Built `apps/web` on mock data: tokens/fonts, motion library, shell, all customer + portal pages; mock API with serializer tests; ticked T-1xx/T-2xx UI items as `[~]` |
| 2026-10-19 | Claude (foundation) | T-108 state machine + tests; T-102 Docker Postgres/Redis; T-104 `packages/db` schema, migration, seed; T-105 env validation for web + api; T-106 NestJS core in `apps/api`; T-103 CI workflow; T-120 OTP sign-in, T-122 sessions, T-123 guards (ownership pending); fixed phone normalisation bug; T-121 staff password + TOTP MFA; T-124 invites; T-125 users/roles API; T-126 audit log; T-146/147 public catalogue API; web catalogue switch via API_URL; T-140…145 admin catalogue API; fixed PATCH-defaults bug |
| 2026-10-20 | Claude (backend) | M1.4 API: `POST /v1/enquiries` (T-160 minus Turnstile), pipeline list/board/workspace (T-163/165 API), transitions with reason/notes/audit (T-164), availability + rep acceptance + automatic confirmation (T-166), round-robin owner (T-167); migration `pipeline_refs` (Booking.ref, Lead.createdIp, ref sequences) |
| 2026-10-20 | Claude (backend) | Fixed e2e tests hitting talent_dev (PrismaService URL, TEST_DATABASE_URL guard). M1.5 quotes API: quote maths in utils, staff builder with role-aware fields, QUO-6 approval, send, customer bookings + accept/request changes/expiry; migration `quotes` (Lead.startTime, Quote.gstBps/inclusions/approvalReasons/sentAt) |
| 2026-10-20 | Claude (backend) | M1.6 core: payment links + signed idempotent gateway webhook, manual payments (Accounts), receipts, contracts via e-sign adapter + webhook, confirmation after each event; full-lifecycle e2e; migrations `payments`, `payment_link_url` |
| 2026-10-20 | Claude (backend) | M1.7 API: talent portal (profile, bookings with payout only, payouts, blackouts with admin switch) for talent and rep logins; T-223 leak tests; migration `portal` (Talent.blackoutSelfEdit) |
| 2026-10-20 | Claude (web + api) | Web switched to the real API behind a flag: /api/v1 proxy with httpOnly token cookies, refresh in proxy + middleware, phone OTP sign-in dialog, sign-out; API favourites + contact form (migration `contact`). Verified live: sign-in, bookings, SSR detail page, refresh, logout |
| 2026-10-20 | Claude (backend) | M1.8 API: ops checklist, completion → payouts, cancellation with policy ref + refund review, payouts (schedule/adjust/paid) with final margin, analytics dashboard; migration `settlement` |
| 2026-10-20 | Claude (admin) | `apps/admin` scaffolded: staff sign-in with authenticator setup, role-filtered shell, overview (analytics), pipeline board + table, lead workspace (stage moves with reason/notes, availability, rep acceptance, notes, activity). Verified live with screenshots; analytics fixed for pre-`sentAt` quotes and impossible confirm times |
| 2026-10-20 | Claude (hardening) | Security review: MFA enforced in sessions (staff roles only with MFA), proxy origin checks, headers/CSP, admin IP allowlist, Dependabot + CI audit (overrides for 4 high advisories); backups + restore drill scripts (drill passed); parallel-test race fixed; docs/runbook.md |
| 2026-10-20 | Claude (hardening) | Accessibility pass (axe, web + admin, desktop + phone) with contrast fixes and admin skip link; performance pass: listing CLS fixed + SSR'd cards, enquire LCP 1.1 s, lazy calendar, ISR 5 min + on-demand revalidation |
