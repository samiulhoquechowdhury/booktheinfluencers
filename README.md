# Talent Booking Platform

Turborepo + pnpm monorepo. Product and technical docs live in [`docs/`](docs/) — start with `docs/memory.md`.

| Path | What | Port |
|---|---|---|
| `apps/web` | Next.js — public site, customer dashboard, talent portal | 3000 |
| `apps/admin` | Next.js — internal staff CRM | 3001 |
| `apps/api` | NestJS — REST API (`/v1`) | 4000 |
| `packages/config` | Shared tsconfig | |
| `packages/schemas` | Zod schemas shared by frontend and backend | |
| `packages/utils` | Money, dates, state machine | |
| `packages/ui` | Design tokens + shared components | |

Coming next: `packages/db` (Prisma + PostgreSQL) and `apps/worker` (BullMQ jobs).

## Getting started

Needs Node 22+, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up        # Postgres 16 on :5440, Redis on :6390
pnpm dev          # runs every app
pnpm --filter web dev   # or just one
```

Other scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`, `pnpm db:down`.
