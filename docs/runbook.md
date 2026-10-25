# Operations runbook

> For whoever runs BookTheInfluencer in staging/production. Related: `trd.md` §10–11, `memory.md`.

## Backups and the restore drill (T-263)

Managed Postgres keeps its own point-in-time backups. These scripts give an independent logical copy and prove it can be restored.

| Task | Command |
|---|---|
| Back up (any environment) | `DATABASE_URL=postgresql://… scripts/db-backup.sh` |
| Back up local dev | `BACKUP_VIA=docker PGDATABASE=talent_dev scripts/db-backup.sh` |
| Restore drill | `ADMIN_URL=postgresql://user:pass@host:5432/postgres scripts/db-restore-drill.sh [dump]` |
| Restore drill, local | `BACKUP_VIA=docker scripts/db-restore-drill.sh` |

- Dumps go to `./backups` (git-ignored) as `<db>-<UTC time>.dump` with a `.sha256` file. Older than `RETAIN_DAYS` (default 14) are pruned. Store them off the database host.
- The drill restores into a scratch database (`talent_restore_drill`), checks the checksum, the migration history and the core tables, and then drops it (`KEEP=1` keeps it). It refuses any target not named `*drill*`, so it can never overwrite a real database.
- Run the drill monthly and after any migration that changes data. Last run: 2026-10-20 on dev (16 s, passed).

## Security checklist (T-260, trd §10)

| Item | Status |
|---|---|
| Helmet, strict CORS on the API | Done |
| CSRF on cookie sessions | SameSite cookies; the web and admin `/api/v1` proxies also refuse writes from another origin |
| Rate limits | OTP 3/10 min per phone and IP, 30 s resend; enquiry 5/h per IP; contact 5/h per IP; staff login 10/15 min. A global per-IP limit waits for the Redis client (with the worker) |
| MFA for all staff | Enforced in the session: only password + authenticator sessions carry staff roles; phone-code sessions are stripped of them, including after refresh |
| RBAC + ownership | `@Roles()` on every staff route; customers and talent only see their own bookings (404 otherwise) |
| Secrets at rest | MFA secrets AES-256-GCM; passwords scrypt; refresh tokens and OTPs stored as HMACs |
| Security headers (web, admin) | nosniff, frame DENY, referrer policy, Permissions-Policy, HSTS in production; strict CSP on the admin app |
| Admin isolation | Separate app and domain, `noindex`, optional `ADMIN_IP_ALLOWLIST` |
| Dependency scanning | Dependabot weekly; `pnpm audit --prod --audit-level high` in CI |
| Logs | Authorization, cookies and Set-Cookie redacted; phone numbers masked |

## Production settings to check before launch

- **Demo OTP bypass:** `OTP_ACCEPT_ANY` (any 6-digit code signs in and code-send limits are off) is on for local demos only. Set it to `false` or remove it, and delete the bypass in `otp.service.ts` before launch. The API refuses to start with it in production.
- API: `NODE_ENV=production` refuses the dev-only adapters (console SMS, fake gateway, fake e-sign) and requires `SUPPORT_PHONE`. Set `CORS_ORIGINS`, `INVITE_BASE_URL` (website `/invite`), `STAFF_INVITE_BASE_URL` (admin `/invite`), distinct 32+ character secrets, `MFA_ENCRYPTION_KEY` (32 bytes, base64).
- Web: `NEXT_PUBLIC_API_BASE=/api/v1`, `API_URL`, `NEXT_PUBLIC_SITE_URL`.
- Admin: `API_URL`, `NEXT_PUBLIC_WEB_URL`, optionally `ADMIN_IP_ALLOWLIST`.
- On-demand page refresh after catalogue edits: `WEB_REVALIDATE_URL` (website `/api/revalidate`) and `REVALIDATE_SECRET` on the API; the same `REVALIDATE_SECRET` on the website.
- Monitoring: point uptime checks at `GET /v1/health` (checks the database). Error tracking (Sentry) is pending an account.
