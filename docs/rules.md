# Rules — Engineering & AI-Agent Rules

> These rules apply to every human developer and AI coding agent working in this repo.
> Read `memory.md` first, then the relevant doc (`srs.md`, `trd.md`, `architecture.md`, `design.md`), then `task.md`.

---

## 0. Golden rules (never break)
1. **No booking becomes `CONFIRMED` manually.** Only the confirmation rule in `trd.md §5` sets it.
2. **Margin, internal cost, rate cards and payouts never leak** to customers; selling price and margin never leak to talent. Enforce in API serializers + tests, not just UI.
3. **Money is integer paise (`BigInt`); percentages are basis points (`Int`).** No floats, no `Number` for money math.
4. **Payment state changes only from verified webhooks or Accounts' manual entry** — never from the client.
5. **Every mutation on bookings, quotes, payments, payouts, rate cards and roles is audit-logged.**
6. **Never display "Book Now", "Instant confirmation" or a single exact public fee** for any talent.
7. **No secrets in code or logs.** Use env vars validated by Zod.
8. **Do not invent requirements.** If something is unclear, add it to `memory.md → Open questions` and ask.

## 1. Workflow
- Pick a task from `task.md`; mark it `[~]` in progress, `[x]` when merged.
- One task = one branch = one PR. Branch: `feat/<area>-<short>`, `fix/…`, `chore/…`.
- Commits: Conventional Commits (`feat(quotes): add version history`).
- PR must include: what/why, screenshots for UI, migration notes, tests added.
- After finishing, update `memory.md` (status, decisions, gotchas).

## 2. TypeScript
- `strict: true`, no `any` (use `unknown` + narrowing). No `@ts-ignore` without a linked issue.
- Shared request/response shapes live in `packages/schemas` (Zod) — never duplicate types by hand.
- Prefer named exports; one component/class per file.
- Use `type` for data shapes, `interface` only for extendable contracts (providers).

## 3. Backend (NestJS)
- Structure per module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `dto/`, `*.spec.ts`.
- Controllers: thin — validate (ZodPipe), authorize (guards), call service, return DTO.
- Services: business logic; no Prisma calls outside repositories.
- Every endpoint has `@Roles(...)` (or `@Public()` explicitly). Resource access checks ownership.
- Use transactions (`prisma.$transaction`) for anything touching money or state.
- State changes go through `packages/utils/stateMachine.ts`; never set `stage` directly.
- Webhooks: verify signature → idempotency insert → enqueue → 200. Processing in worker.
- External providers only via adapter interfaces in `infra/providers`.
- Errors: throw domain errors (`BookingNotConfirmableError`) mapped by a global filter to `{ error: { code, message } }`.
- Logging: pino, structured, include `requestId`; never log PII, tokens or full payment payloads.

## 4. Database (Prisma)
- Every schema change = a migration with a descriptive name. Never edit applied migrations.
- Migrations must be backwards compatible (expand → migrate → contract).
- Soft delete (`deletedAt`) for users, talents, leads; hard delete never for financial records.
- Add indexes for every foreign key and every filter column used in lists.
- Seed script keeps staging/dev usable (categories, 30 talents, sample leads in each stage).

## 5. Frontend (Next.js)
- App Router; Server Components by default; `"use client"` only where interactive.
- Public pages SSR/ISR with proper `metadata`, OpenGraph and JSON-LD.
- Data fetching in client components via TanStack Query hooks in `lib/api/`.
- Forms: React Hook Form + Zod resolver using shared schemas.
- Styling: Tailwind + design tokens from `packages/ui`; no hard-coded hex colours in components.
- Components from `packages/ui` first; add new shared ones there, not per app.
- Money display only through `formatINR(paise)`; dates through `formatDate()` (IST).
- Every list has loading, empty and error states. Every action has pending + success/error feedback.
- `RoleGate` hides UI but **never** replaces API checks.
- Accessibility: labels, focus states, keyboard nav, alt text — check with axe in Playwright.

## 6. Security
- Validate all input server-side with Zod, even if validated in the client.
- Presigned URLs for uploads/downloads; mime + size allowlist; private bucket for documents.
- Rate-limit OTP, login, enquiry endpoints.
- Staff routes require MFA session.
- Dependencies: no new package without checking maintenance, licence and size; justify in PR.

## 7. Testing
- New business logic requires unit tests; new endpoint requires an e2e test.
- Mandatory tests:
  - serializer tests asserting forbidden fields absent per role
  - state machine transitions (allowed + rejected)
  - money calculations (rounding, tax, margin)
  - webhook idempotency (duplicate + out-of-order)
- CI must pass: `lint`, `typecheck`, `test`, `build`. No merging red builds.

## 8. Naming
| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `quote-builder.tsx` |
| React components | PascalCase | `QuoteTable` |
| Variables/functions | camelCase | `calculateMargin` |
| Enums / constants | UPPER_SNAKE | `ADVANCE_PENDING` |
| DB tables (Prisma models) | PascalCase singular | `PaymentMilestone` |
| Money fields | suffix `Paise` | `totalPaise` |
| Percent fields | suffix `Bps` | `commissionBps` |
| API routes | kebab-case plural nouns | `/v1/admin/rate-cards` |

## 9. AI-agent specific
- Read `memory.md` at the start of every session; update it at the end.
- Work on **one task at a time**; don't refactor unrelated code.
- Before writing code, state the plan (files to touch) in the PR/session notes.
- Never delete or rewrite migrations, tests or docs to make something pass.
- Don't add libraries outside `trd.md §1` without recording the decision in `memory.md`.
- If a requirement conflicts with these rules or the docs, stop and log it under Open questions.
- Keep generated code consistent with existing patterns; copy the nearest working module as reference.
- Don't mark a task done until tests pass and acceptance criteria in `task.md` are met.
