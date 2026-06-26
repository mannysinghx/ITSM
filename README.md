# FlowDesk ITSM

A modern, multi-tenant IT Service Management (ITSM) platform for individuals, teams, and
companies — tickets, tasks, SLAs, a service catalog with approval chains, AI-assisted
triage, a workflow/automation engine, and a knowledge base.

> **The keystone:** tenant isolation is enforced **at the database** with PostgreSQL
> Row-Level Security — not just by remembering a `WHERE tenant_id` in application code. A
> forgotten filter cannot leak another tenant's data, because the database itself refuses
> to return it.

**Status: all 8 build phases complete.** 64 automated tests green (run as the RLS-enforced
application DB role), typecheck and production build clean.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Architecture at a glance](#architecture-at-a-glance)
- [The nine binding decisions (ADRs)](#the-nine-binding-decisions-adrs)
- [Feature tour](#feature-tour)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Demo accounts](#demo-accounts)
- [Project structure](#project-structure)
- [How isolation actually works](#how-isolation-actually-works)
- [The authorization engine](#the-authorization-engine)
- [Testing & the release gate](#testing--the-release-gate)
- [Operations](#operations)
- [What is intentionally deferred](#what-is-intentionally-deferred)
- [Documentation](#documentation)

---

## Why this exists

ITSM products live or die on **trust between tenants**. If one company can see another's
tickets — even once, even by guessing an ID — the product is finished. FlowDesk is built
so that the catastrophic failure mode is *structurally* hard, not merely discouraged by
code review.

It supports two shapes of customer from a single unified model:

- **Individuals** — sign up and immediately get a personal ITSM workspace.
- **Companies** — create an organization with teams, users, roles, and isolated team
  spaces; each member sees only what their role and team allow.

An individual is simply a tenant of `type = individual` with one default team, so there is
**one code path**, not a forked product.

---

## Architecture at a glance

A **modular monolith** (Next.js full-stack) backed by PostgreSQL with RLS. Everything that
could become a separate service later (AI provider, email, Slack/Teams, webhooks, the SLA
and automation workers) sits behind an abstraction today.

```
            Browser (Next.js App Router, React 19, Tailwind)
                              │  HTTPS, httpOnly session cookie
                              ▼
        Route handlers  ──►  requireAuth → AuthContext (built once/request)
                              │
                              ▼
     Service layer (lib/*)  ──►  withTenant(tenantId, userId, tx => …)
                              │        sets per-transaction RLS context
                              ▼
   PostgreSQL  ── Row-Level Security on every tenant-owned table ──┐
     • app role  (flowdesk_app)   — runtime, RLS-enforced          │
     • owner role (flowdesk_migrator) — migrations/seed only       │
                                                                   ▼
   Behind abstractions: AI provider · email · Slack/Teams · webhooks · storage · worker
```

**By the numbers:** ~13k lines of TypeScript · 58 Prisma models · 9 migrations · 87 API
route handlers · 32 UI pages · 64 tests · 60+ granular permission keys.

---

## The nine binding decisions (ADRs)

Every line of code inherits from [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md).
The load-bearing ones:

| ADR | Decision |
|-----|----------|
| **ADR-1** | Tenant isolation is enforced with Postgres RLS (`ENABLE` + `FORCE`). The app connects as a non-owner role; the table owner is used only for migrations/seed. |
| **ADR-2** | Tenant context is set **per-transaction** via `set_config(..., true)` (SET LOCAL semantics) to avoid connection-pool identity bleed. The tenant id comes only from the session — never from request input (IDOR guard). |
| **ADR-3** | Authorization is an **engine**, not a list of keys: ordered scopes (`own < team < all`), a single object-access gate per resource, and list-filters derived from the *same* decision (property-tested to agree). |
| **ADR-4** | Team scoping lives in the app layer (it's a per-user set with carve-outs); RLS handles the one-value tenant boundary. |
| **ADR-5** | Configurable business rules are data, not enums: ticket statuses/types are FK tables, priority comes from a configurable matrix. |
| **ADR-6** | Tables the features need are first-class from the start: approvals, SLA timers, workflow runs, attachments, counters. |
| **ADR-7** | Per-tenant ticket numbering via an atomic counter (race-free, not `MAX()+1`). |
| **ADR-8** | The audit log is append-only — the app role has `INSERT`+`SELECT` only; high-value mutations write audit rows in the same transaction. |
| **ADR-9** | Synchronous side-effects run inline; anything with a wait/retry (webhooks, escalations, SLA elapsing) runs in a worker. SLA math is calendar-time, labeled as such. |

Five tested invariants back these up — e.g. *INV-1*: a cross-tenant read returns `null`
even with a valid guessed id, run as the app role; *INV-2*: `canRead(u,x) ⇔ x matches
readFilter(u)` for all inputs.

---

## Feature tour

Built in eight additive phases; each was verified live before the next began.

### Phase 1 — Foundation
Individual + company signup (atomic provisioning), login with multi-tenant support,
logout, server-side sessions. Unified tenant model, teams, memberships, the RBAC engine,
RLS-enforced isolation, append-only audit, and seed data.

### Phase 2 — Tickets
Full ticket lifecycle: CRUD, queue (sortable table ⇄ status kanban) with filters and
search, detail page (spec §21.4), public comments + internal notes (hidden from
requesters), assignment, status transitions, attachments, history timeline. Statuses/types
are FK config tables; priority is derived from a configurable impact×urgency matrix;
ticket numbers come from an atomic per-tenant counter.

### Phase 3 — Admin
A permission-gated admin area: user management (invite/suspend/assign role+team), team
management, roles & permissions (system + custom, allow-only union), ticket configuration
(types/statuses/priority-matrix/categories/custom-field defs become editable), and a
read-only audit-log viewer. Every admin route is gated; every mutation is audited.

### Phase 4 — Tasks & SLAs
Tasks (standalone or ticket-linked) with a status board, assignee, due date, history. SLA
policies (matched by type/priority/team, most-specific wins) that stamp due dates and
insert timer rows **at ticket creation**. An **idempotent** `checkSlaBreaches()` worker
that warns → breaches → escalates exactly once per timer. In-app + mock-email
notifications honoring per-user preferences.

### Phase 5 — Service Catalog
A self-service request portal: pick a catalog item, fill a dynamically-rendered form (the
spec's field types, Zod-validated server-side), submit — which **creates a ticket** in one
transaction with the item's defaults and routed team. Approval-required items open a
first-class **sequential approval chain** (approve/reject advances or halts it; only the
designated approver can decide; every decision audited).

### Phase 6 — AI
Every AI feature goes through one provider-neutral service that returns **deterministic
mock output when no API key is set** — the product ships and tests run with zero model
config. Six functions (classify, suggest priority/team, summarize, draft response, generate
knowledge article); each enforces enabled/per-module toggles, a token-budget hard stop,
and PII redaction-by-default, then logs the request and updates usage. Guardrails live in
the service: every output is `aiSuggested`, there is no auto-close path, and external send
is refused unless explicitly allowed. Includes the knowledge base (articles + append-only
versions + feedback), fed by AI drafts.

### Phase 7 — Integrations
An event-driven **automation engine**: ticket mutations emit events; rules match,
conditions evaluate, and synchronous actions run inline (reusing the ticket write path so
history+audit fire) while wait/retry actions are deferred to a worker. A per-cascade dedupe
set + depth cap guarantee a self-triggering rule terminates. **Email-to-ticket** behind a
written threat model (DMARC-fail rejected, tenant resolved server-side, signature strip).
Scoped, hashed **API keys** with once-shown tokens and append-only activity. Slack/Teams/
webhook delivery via a mock worker transport.

### Phase 8 — Hardening
Brute-force login lockout (5 fails → 15-min lock, no enumeration) + rate limiting; **MFA**
(TOTP per RFC 6238 + recovery codes) gating app access until the session challenge is met;
email verification + password reset over single-use hashed tokens; billing plans with usage
metering and **limit enforcement** on create paths; the **expanded cross-tenant IDOR
matrix** over every tenant-owned resource; `/api/health`, `/api/ready`, `/metrics` probes.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Database | PostgreSQL 14+ with Row-Level Security |
| ORM | Prisma 6 |
| Validation | Zod |
| Styling | Tailwind CSS |
| Auth | Email/password, bcrypt, server-side sessions (httpOnly cookie), TOTP MFA |
| Tests | Vitest (run as the app DB role) |
| AI / Email / Channels | Provider-neutral abstractions with deterministic mocks |

No vendor is hardcoded: Redis, a real LLM provider, SMTP, S3, and the observability stack
are post-MVP hooks selected automatically when configured.

---

## Getting started

**Requirements:** Node ≥ 20, pnpm, PostgreSQL ≥ 14.

```bash
pnpm install

# 1. Create the database + the TWO required roles (ADR-1).
psql -d postgres <<'SQL'
CREATE ROLE flowdesk_migrator LOGIN PASSWORD 'migrator_dev_pw' CREATEDB;
CREATE ROLE flowdesk_app      LOGIN PASSWORD 'app_dev_pw';
CREATE DATABASE flowdesk OWNER flowdesk_migrator;
SQL

# 2. Configure env (see .env.example). .env = app role; .env.migrate = migrator role.
cp .env.example .env        # then set credentials

# 3. Migrate, install RLS policies + grants, seed demo data.
pnpm db:migrate             # create tables (migrator role)
pnpm db:rls                 # install RLS policies + app-role grants (ADR-1, ADR-8)
pnpm seed                   # demo tenants, users, tickets, catalog, SLAs

# 4. Run.
pnpm dev                    # http://localhost:3000
```

> ⚠️ **Why two DB roles?** The app must connect as a **non-owner** role for RLS to apply.
> If it connects as the table owner, RLS silently does nothing. `.env` holds the app role;
> `.env.migrate` holds the owner role used only by `db:migrate` / `db:rls` / `seed`.
>
> ⚠️ **After any migration that adds a tenant-owned table**, add it to `TENANT_TABLES` in
> [`prisma/apply-rls.ts`](prisma/apply-rls.ts) and re-run `pnpm db:rls`.

### Scripts

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Run the dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest suite, **as the app DB role** (RLS in force) |
| `pnpm db:migrate` | Prisma migrate (owner role) |
| `pnpm db:rls` | Apply RLS policies + grants |
| `pnpm seed` | Reset + seed demo data |

---

## Demo accounts

All passwords are `password123`.

| Email | Role |
|-------|------|
| `individual@example.com` | Individual owner (personal workspace) |
| `admin@acme.test` | Acme owner / admin |
| `it.manager@acme.test` | IT Support team manager |
| `it.agent@acme.test` | IT Support agent |
| `sec.agent@acme.test` | Security agent |
| `requester@acme.test` | Requester (own tickets only) |

Acme Corp is seeded with four teams, demo tickets, SLA policies, and a service catalog
(Reset Password, Request New Laptop — the latter with a manager approval chain).

---

## Project structure

```
docs/
  ARCHITECTURE_DECISIONS.md     # the binding ADRs (read first)
  00-OVERVIEW.md                # phase index + status
  TEST-CHECKLIST.md             # the 15 acceptance tests → commands
  phases/PHASE-1..8-*.md        # per-phase plans (goal, schema, API, cuts, DoD)
  adr/email-to-ticket-threat-model.md

prisma/
  schema.prisma                 # 58 models
  apply-rls.ts                  # RLS policies + grants (run after every migration)
  seed.ts                       # demo data
  migrations/                   # 9 migrations

src/
  app/                          # Next.js routes — pages + /api route handlers
  components/                   # client components (tickets, tasks, catalog, knowledge, admin)
  lib/
    db.ts                       # Prisma client + withTenant / withUser (ADR-2)
    authz.ts                    # the authorization engine (ADR-3) — pure predicates
    auth/                       # password, session, context, login, MFA, tokens, email flows
    tickets/ tasks/ sla/        # ticket, task, and SLA services
    catalog/ knowledge/         # service catalog + approvals; knowledge base
    ai/                         # provider-neutral AI service, router, redaction, mock
    automation/ integrations/   # event engine, conditions; email-to-ticket, API keys, channels
    billing/ admin/             # plan limits + metering; admin services
    audit.ts permissions.ts     # append-only audit; permission vocabulary + default roles

tests/                          # 13 spec files, run as the app DB role
```

---

## How isolation actually works

Three layers, defense-in-depth:

1. **RLS at the database (ADR-1).** Every tenant-owned table has a policy
   `tenant_id = current_setting('app.current_tenant_id')` with a matching `WITH CHECK`
   (so a request can't *write* another tenant's id either). The app role is not the table
   owner, so it cannot bypass the policy.

2. **Per-transaction context (ADR-2).** All tenant data flows through `withTenant`:

   ```ts
   export function withTenant(tenantId, userId, fn) {
     return prisma.$transaction(async (tx) => {
       await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
       await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
       return fn(tx);
     });
   }
   ```

   The `true` flag scopes the setting to the transaction (SET LOCAL semantics), so a pooled
   connection can never carry one request's tenant into the next. The `tenantId` is read
   from the **session**, never from the URL or body.

3. **Bootstrap escape hatches, modeled deliberately.** A few lookups are legitimately
   pre-tenant (login's "which tenants am I in", API-key verification by hash, mailbox →
   tenant routing). These use either user-scoped RLS policies or dedicated **global** tables
   (`sessions`, `api_keys`, `mailbox_routes`, `auth_tokens`) — like a session token, looked
   up before a tenant context exists, then scoping everything thereafter.

This is proven, not asserted: `tests/idor.test.ts` builds two tenants and confirms every
resource type is invisible across them **as the app role**.

---

## The authorization engine

Permission keys are a vocabulary; the engine is the grammar (ADR-3).

- **Ordered scopes.** `ticket.read.own < ticket.read.team < ticket.read.all`. The engine
  resolves the highest scope a user holds; `all` implies `team` implies `own`.
- **One gate per resource.** `canReadTicket` / `canWriteTicket` decide single-object access.
- **List filters from the same decision.** `ticketReadFilter` builds the Prisma `where`
  fragment from the identical scope logic — and a property test asserts the two agree for
  every scope × relationship combination (INV-2), so the queue can never show a ticket the
  detail page would 403.
- **Built once per request.** `AuthContext { userId, tenantId, teamIds[], permissionKeys }`
  is assembled once and threaded down; helpers never re-query roles.

---

## Testing & the release gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

The 64 tests run via `dotenv -e .env -- vitest`, i.e. **as `flowdesk_app`** with RLS in
force — so isolation tests exercise the real database boundary, not a mock. Coverage maps
to all 15 acceptance criteria (see [`docs/TEST-CHECKLIST.md`](docs/TEST-CHECKLIST.md)) plus
phase invariants: RLS isolation, the authz property test, internal-note invisibility, SLA
worker idempotency, approval-chain advancement, automation loop-termination, API-key scope,
email spoof rejection, brute-force lockout, MFA, and plan-limit enforcement.

---

## Operations

```bash
curl localhost:3000/api/health   # liveness  → {"status":"ok"}
curl localhost:3000/api/ready    # readiness → checks the database
curl localhost:3000/metrics      # Prometheus exposition (minimal)
```

The SLA worker (`checkSlaBreaches(tenantId)`) and the deferred-action worker
(`processDeferredSteps(tenantId)`) are background-compatible plain functions — callable from
a cron, a queue, or the manual trigger endpoint. They are idempotent: re-running fires no
duplicate events.

---

## What is intentionally deferred

This is an MVP that ships and tests end-to-end without external services. The following are
**explicitly** out of scope (reserved in schema/abstractions, not silently stubbed):

- **Observability wiring** — OpenTelemetry/Prometheus/Grafana/Loki/Sentry export (a minimal
  `/metrics` exists; full tracing is the hook).
- **Real SMTP / Slack / Teams delivery** — mock transports are used when no credential is set.
- **A real LLM provider** — the deterministic mock is used until `AI_API_KEY` is present.
- **Redis** — the rate limiter is in-memory per-process (fine for one node; use Redis in prod).
- **Payment processing** — billing models plans, limits, and metering;
  `externalCustomerId`/`externalSubscriptionId` are reserved for a processor.
- **Load tests, SSO/SCIM, legal hold, multi-region, drag-and-drop workflow builder** — named
  later layers.

Each phase doc lists its own cuts under an explicit "Explicit cuts / deferrals" section.

---

## Documentation

- [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) — the binding ADRs.
- [`docs/00-OVERVIEW.md`](docs/00-OVERVIEW.md) — phase index and status.
- [`docs/phases/`](docs/phases) — per-phase plans (goal, schema, API surface, tasks, cuts,
  definition of done).
- [`docs/TEST-CHECKLIST.md`](docs/TEST-CHECKLIST.md) — the 15-acceptance-test release gate.
- [`FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md`](FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md)
  — the original product/architecture brief this was built from.

---

_Built as a phased, test-verified implementation. The make-or-break is tenant and team
isolation — done at the database, so the platform can grow into a full ITSM suite without
re-earning that trust._
