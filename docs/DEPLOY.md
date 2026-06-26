# Deploying FlowDesk ITSM to Railway

This app is a long-running Next.js server backed by PostgreSQL with Row-Level Security.
Railway runs the web service and the database in one project.

## What's automated

- **Build:** Nixpacks detects pnpm + Next.js → `pnpm install` (generates the Prisma client
  via postinstall) → `pnpm build`.
- **Release (pre-deploy):** `pnpm release` runs `scripts/release.sh` on every deploy,
  **before** the new version serves traffic. It applies pending migrations and reinstalls
  RLS policies + grants as the owner role. Both steps are idempotent.
- **Start:** `pnpm start` (`next start`, binds to `$PORT`).
- **Health check:** `/api/health`.

All configured in [`railway.json`](../railway.json).

## Required environment variables (on the web service)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Runtime connection as the **app** role (`flowdesk_app`) — RLS-enforced. |
| `MIGRATE_DATABASE_URL` | Connection as the **owner** role (`flowdesk_migrator`) — used only by the release step. |
| `SESSION_SECRET` | A 32+ byte random string. |
| `NODE_ENV` | `production` |

Optional hooks (safe defaults when unset): `AI_API_KEY`, `SMTP_URL`, `REDIS_URL`,
`SENTRY_DSN`, `STORAGE_DIR`.

> ⚠️ **Two roles are mandatory (ADR-1).** The app must connect as a non-owner role or RLS
> silently does nothing. Tables are owned by `flowdesk_migrator`; the app uses `flowdesk_app`.

## One-time database setup

After adding a PostgreSQL service, create the two roles (connect as the default `postgres`
superuser via the public proxy URL):

```sql
CREATE ROLE flowdesk_migrator LOGIN PASSWORD '<migrator-pw>';
CREATE ROLE flowdesk_app      LOGIN PASSWORD '<app-pw>';
-- Let the migrator own the schema so migrations can create tables it owns.
ALTER SCHEMA public OWNER TO flowdesk_migrator;
GRANT ALL ON SCHEMA public TO flowdesk_migrator;
```

The release step (`pnpm release`) then creates the tables (owned by `flowdesk_migrator`),
applies RLS, and grants the app role its limited privileges.

## Wiring DATABASE_URL with Railway references

Set on the **web service**, referencing the Postgres service's host/port/db:

```
DATABASE_URL         = postgresql://flowdesk_app:<app-pw>@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
MIGRATE_DATABASE_URL = postgresql://flowdesk_migrator:<migrator-pw>@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
```

(Use the Postgres **private** host so traffic stays on Railway's internal network.)

## Seeding demo data (optional)

Run once against the database (locally, pointed at the public proxy URL, as the migrator):

```bash
MIGRATE_DATABASE_URL="postgresql://flowdesk_migrator:<pw>@<public-host>:<port>/railway" \
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm tsx prisma/seed.ts
```

## Scheduling the workers

The SLA and deferred-automation workers are plain functions exposed via endpoints. Add a
Railway Cron (or any scheduler) to hit them periodically — e.g. `POST /api/internal/sla/check`.

## Notes for scale

- The rate limiter is in-memory (per instance). If you run more than one replica, set
  `REDIS_URL` and move it to a shared store.
- A single web instance needs no external pooler; the per-transaction tenant context
  (ADR-2) is also compatible with a transaction-mode pooler if you add one later.
