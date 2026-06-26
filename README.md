# FlowDesk ITSM

Multi-tenant ITSM platform. Tenant isolation is enforced at the **database** with
Postgres Row-Level Security, not just in application code.

- **Spec:** [`FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md`](FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md)
- **Architecture decisions (binding):** [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md)
- **Build plan:** [`docs/00-OVERVIEW.md`](docs/00-OVERVIEW.md) → phase docs in [`docs/phases/`](docs/phases)

## Status

**Phase 1 (Foundation) — complete.** Auth (individual + company signup, login, logout,
sessions), unified tenant model, teams, memberships, the RBAC authorization engine,
RLS-enforced tenant isolation, append-only audit, and seed data.

**Phase 2 (Tickets) — complete.** Ticket CRUD, queue (table + kanban) with filters and
search, detail page (spec §21.4), public comments + internal notes (hidden from
requesters), assignment, status transitions, attachments, and a history timeline.
Tenant-isolated via RLS; access resolved by a single `canReadTicket`/`canWriteTicket`
gate whose list-filter counterpart is property-tested to agree (INV-2). FK config
tables for statuses/types, configurable priority matrix, and atomic per-tenant ticket
numbering.

**Phase 3 (Admin) — complete.** Admin area (`/app/admin/*`) gated on an admin-tier
permission: overview dashboard, user management (invite/suspend/assign role+team),
team management (create/edit/archive/members), roles & permissions (system + custom,
allow-only union), ticket configuration (types, statuses, priority matrix, categories,
custom-field defs — the Phase 2 read-only config becomes editable here), and a
read-only audit-log viewer. Every admin route is `requirePermission`-gated and every
mutation writes an `audit_logs` row in the same transaction.

**Phase 4 (Tasks & SLAs) — complete.** Tasks (standalone or ticket-linked) with a status
board, assignee, due date, and history. SLA policies (matched by type/priority/team,
most-specific wins) that stamp first-response/resolution due dates and insert
`sla_timers` rows **at ticket creation**. An idempotent `checkSlaBreaches()` worker that
warns → breaches → escalates exactly once per timer (the `warnedAt`/`breachedAt` columns
are the latches), callable headless or via a manual trigger endpoint. In-app + mock-email
notifications honoring per-user preferences. SLA math is calendar-time (labeled as such);
business-hours/holiday math is deferred.

**Phase 5 (Service Catalog) — complete.** A request portal where users pick a catalog
item, fill a dynamically-rendered form (the §13 field types, Zod-validated server-side),
and submit — which creates a ticket in one transaction with the item's defaults
(priority/team/source) and SLA stamping. Catalog items + form definitions are
admin-authored. Approval-required items materialize a first-class `approvals` chain
(`sequence`/`status`/`decidedBy`); approve/reject endpoints advance or halt it strictly
by sequence, only the designated approver (user / team-manager / role holder) can decide
a step, every decision is audited, and `approval.requested/approved/rejected` events are
emitted. An approvals inbox shows each user their active pending steps.

**Phase 6 (AI) — complete.** Every AI feature goes through one provider-neutral service
(`lib/ai/service.ts`) that returns **deterministic mock output when no API key is set** —
the product ships and tests run with zero model config. Six functions (classify, suggest
priority/team, summarize, draft response, generate knowledge article); each enforces the
enabled + per-module toggle, a token-budget hard stop, PII redaction-by-default, then
logs an `ai_requests` + `ai_outputs` row and updates `ai_token_usage` — all tenant-scoped.
Guardrails are in the service layer: every output is `aiSuggested=true`, there is no
auto-close path, and external send is refused unless the tenant explicitly allows it. AI
config lives in `tenants.settings.ai` and every change is audited. The knowledge base
(articles + append-only versions + feedback) lands here, fed by AI-generated drafts.
**Phase 7 (Integrations) — complete.** Ticket mutations emit events through one
dispatcher (`emitEvent`); an automation engine matches enabled rules, evaluates
conditions, and runs the **synchronous** action set inline (set_priority, assign_team/
user, add_tag, send_notification, create_task, add_internal_note) while **deferring**
anything with a wait/retry (webhook, Slack/Teams, escalate) to a worker (ADR-9). Every
dispatch is recorded in `workflow_runs`/`workflow_run_steps`; a per-cascade dedupe set +
depth cap guarantee a self-triggering rule terminates. Email-to-ticket parses inbound
mail into threaded tickets behind a written threat-model (DMARC-fail rejected, tenant
resolved server-side via a global mailbox route, sender allow/blocklist, signature
strip). Scoped, hashed API keys with once-shown tokens and append-only activity. Slack/
Teams/webhook delivery is a mock worker transport.

**Phase 8 (Hardening) — complete.** Brute-force login lockout (5 failures → 15-min lock,
no account enumeration) + per-IP rate limiting; MFA (TOTP per RFC 6238 + one-time
recovery codes, no external deps) gating app access until the session challenge is
satisfied; email verification + password reset over single-use, expiring, hashed tokens
(mock email transport); billing plans with usage metering and limit enforcement on the
users/teams/tickets/integrations create paths; the expanded cross-tenant **IDOR matrix**
over every tenant-owned resource (run as the app DB role); and `/api/health`,
`/api/ready`, `/metrics` probes. See [docs/TEST-CHECKLIST.md](docs/TEST-CHECKLIST.md) for
the 15-acceptance-test release gate.

> **Explicitly deferred infra** (needs real services, not built in this MVP): full
> OpenTelemetry/Prometheus/Grafana/Loki/Sentry wiring, real SMTP, load-test harness, and
> a payment processor (`externalCustomerId`/`externalSubscriptionId` are reserved). The
> rate limiter is in-memory (use Redis in prod); the AI/email/channel transports are
> mocks selected automatically when no key/URL is configured.

**All 8 phases complete.** 64 automated tests green (run as the RLS-enforced app role);
typecheck + production build clean.

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
