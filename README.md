# FlowDesk ITSM

Multi-tenant ITSM platform. Tenant isolation is enforced at the **database** with
Postgres Row-Level Security, not just in application code.

- **Spec:** [`FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md`](FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md)
- **Architecture decisions (binding):** [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md)
- **Build plan:** [`docs/00-OVERVIEW.md`](docs/00-OVERVIEW.md) → phase docs in [`docs/phases/`](docs/phases)

## Status

**Phase 1 (Foundation) — complete.** Auth (individual + company signup, login, logout,
sessions), unified tenant model, teams, memberships, the RBAC authorization engine,
RLS-enforced tenant isolation, append-only audit, and seed data. Phases 2–8 are
documented and planned.

## Stack

Next.js (App Router) · TypeScript · Prisma · PostgreSQL (RLS) · Tailwind · Zod · Vitest.

## Setup

Requires Node ≥ 20, pnpm, PostgreSQL ≥ 14.

```bash
pnpm install

# 1. Create database + the TWO required roles (ADR-1):
#    flowdesk_migrator (owner, runs migrations/seed) and flowdesk_app (runtime, RLS-enforced).
psql -d postgres <<'SQL'
CREATE ROLE flowdesk_migrator LOGIN PASSWORD 'migrator_dev_pw' CREATEDB;
CREATE ROLE flowdesk_app      LOGIN PASSWORD 'app_dev_pw';
CREATE DATABASE flowdesk OWNER flowdesk_migrator;
SQL

# 2. Configure env (see .env.example). .env = app role; .env.migrate = migrator role.
cp .env.example .env   # then edit credentials

# 3. Migrate, apply RLS policies + grants, seed:
pnpm db:migrate        # creates tables (migrator role)
pnpm db:rls            # installs RLS policies + app-role grants (ADR-1, ADR-8)
pnpm seed              # demo tenants + users

# 4. Run
pnpm dev               # http://localhost:3000
```

> **Important:** after every migration that adds a tenant-owned table, add it to
> `TENANT_TABLES` in `prisma/apply-rls.ts` and re-run `pnpm db:rls`.

## Demo logins (password: `password123`)

| Email | Role |
|---|---|
| `individual@example.com` | Individual owner |
| `admin@acme.test` | Acme owner/admin |
| `it.manager@acme.test` | IT Support manager |
| `it.agent@acme.test` | IT Support agent |
| `sec.agent@acme.test` | Security agent |
| `requester@acme.test` | Requester |

## Test

```bash
pnpm test        # unit (authz engine) + integration (RLS cross-tenant isolation)
pnpm typecheck
```

The integration suite runs as the `flowdesk_app` role, proving RLS blocks cross-tenant
reads even with a valid guessed id (acceptance #3, #15).

## How isolation works (the keystone)

1. **RLS at the DB** — every tenant table has a policy `tenant_id = current_setting('app.current_tenant_id')`.
   The app connects as a non-owner role, so a forgotten `WHERE` cannot leak data.
2. **Per-transaction context** — `withTenant(tenantId, userId, fn)` sets the tenant via
   `set_config(..., true)` inside a transaction, avoiding connection-pool identity bleed.
   The tenant id comes only from the session, never from request input.
3. **Authorization engine** — scopes are ordered (`own < team < all`); one gate per
   resource; list filters derive from the same decision. See `src/lib/authz.ts`.
