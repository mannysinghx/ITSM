# FlowDesk ITSM — Architecture Decisions (ADR Index)

These decisions are derived from the architectural critique of
`FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md`. Every phase document and
every line of code inherits from these. When a phase doc says "per ADR-X," it
means the rule below is binding, not optional.

---

## ADR-1 — Tenant isolation is enforced at the database with Postgres RLS

**Decision:** Tenant isolation is NOT "remember the WHERE clause." It is enforced
by Postgres Row-Level Security so that even a forgotten filter cannot leak another
tenant's rows.

**Rules:**
1. Every tenant-owned table has `tenant_id uuid NOT NULL` and an RLS policy:
   `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`
   plus the same expression in `WITH CHECK` (blocks writing another tenant's id).
2. Tables use `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY`.
3. The application connects as a dedicated role `flowdesk_app` that is **not** the
   table owner, **not** superuser, and **not** `BYPASSRLS`. Migrations/seed run as
   the owner role `flowdesk_migrator`.
4. Two connection strings: `DATABASE_URL` (app role, RLS-enforced) and
   `MIGRATE_DATABASE_URL` (owner role, for `prisma migrate`/seed only).

## ADR-2 — Tenant context is set per-transaction with `SET LOCAL` semantics

**Decision:** Avoid connection-pool identity bleed. The tenant GUC is set inside a
transaction and evaporates on commit/rollback.

**Rules:**
1. All tenant-scoped DB access goes through `withTenant(tenantId, fn)`, which opens
   a transaction and runs `SELECT set_config('app.current_tenant_id', $1, true)`
   (the `true` = local to transaction) before any query.
2. Never use plain session-level `SET`. Never string-interpolate the tenant id into
   SQL — always parameterize `set_config`.
3. `tenantId` is derived **only** from the authenticated session, never from request
   params, body, or query string. (IDOR guard.)
4. App code cannot obtain an unscoped Prisma client. The raw client is exported only
   to migration/seed code.

## ADR-3 — Authorization is an engine, not a list of keys

**Decision:** Permission keys are a vocabulary; the evaluation engine is the grammar.

**Rules:**
1. Scopes are ordered levels of one action, not separate permissions:
   `own (1) < team (2) < all (3)`. Holding a higher scope implies the lower ones.
2. There is exactly **one** object-access gate per resource (e.g. `canReadTicket`,
   `canWriteTicket`). Route handlers never do ad-hoc ownership checks.
3. List endpoints derive a Prisma `where` fragment from the **same** scope decision
   as the single-object gate. The two MUST agree (property-tested):
   `canRead(u,t) === (t matches readFilter(u))`.
4. Read scope and write scope are independent; write may be narrower and field-level.
5. MVP is **allow-only** (union of role permissions). A `deny` capability and
   field-level write permissions are designed-for but not evaluated in MVP.
6. Temporary access = a `UserRoleAssignment` row with `expiresAt`, filtered at load.
7. `AuthContext { userId, tenantId, teamIds[], permissionKeys[] }` is built **once
   per request** and passed down; helpers do not re-query roles.

## ADR-4 — Team scoping lives in the app layer, not in RLS

**Decision:** RLS handles the one-value tenant boundary. Team access is a per-user
set with permission carve-outs (`ticket.read.all`, cross-team grants) and per-record
exceptions (a requester sees their own ticket even outside their teams) — too dynamic
for SQL policies. It lives in the authz engine (ADR-3).

## ADR-5 — Schema models configurable business rules as data, not enums

**Decision:** The spec promises admin-configurable statuses, types, and priority
matrix. Avoid the brutal enum→FK migration later.

**Rules:**
1. `ticket.status` and `ticket.type` are **FKs** to `ticket_statuses` / `ticket_types`
   tables, seeded with the spec's fixed lists, read-only in MVP UI.
2. Priority is derived from a configurable `priority_matrix` table (impact × urgency),
   computed on write, stored denormalized on the ticket.
3. Custom fields stay `JSONB` in MVP (**known cut: not filterable**); a GIN index is
   the additive future path. This limitation is surfaced in the UI, not hidden.

## ADR-6 — Tables the features require exist from the start

`approvals`, `attachments`, `sla_timers`, `tenant_counters`, `workflow_runs` are
first-class tables, not "placeholders." Rationale: automation events, the SLA worker's
idempotency, and per-tenant ticket numbering all depend on persisted state.

## ADR-7 — Per-tenant ticket numbering via atomic counter

`UPDATE tenant_counters SET ticket_seq = ticket_seq + 1 WHERE tenant_id=$1 RETURNING ticket_seq`
— race-free, per-tenant, single round-trip. Format string lives in tenant settings.
Never `MAX()+1`; never a global sequence.

## ADR-8 — Audit log is append-only

The app role is granted `INSERT` (and `SELECT`) on `audit_logs` but **not** `UPDATE`
or `DELETE`. High-value mutations write audit rows in the same transaction as the
change. Compliance treats audit as an invariant, not a feature.

## ADR-9 — Async work is deferred, and deferrals are explicit

MVP workflow/automation executes **synchronous side-effects only** (set_priority,
assign_team, add_tag, notify-record, create_task, internal_note). Anything with a
wait (approvals elapsing, escalations, webhooks-with-retry, SLA business-hours math)
is Phase 4+/7 and runs in a worker. MVP SLA uses **calendar time**, surfaced in the
UI as such — business-hours math is a named later layer, not silently shipped.

## ADR-10 — Stack

Next.js (App Router) + TypeScript + Prisma + PostgreSQL + Tailwind + shadcn/ui;
Zod for validation; session-based auth (httpOnly cookie); modular monolith. Redis,
Temporal, OpenSearch, S3 are post-MVP hooks behind abstractions.

---

## Consistency invariants (tested, not assumed)

- **INV-1:** Cross-tenant read returns null even with a valid guessed id, when running
  as the app DB role. (Acceptance #3, #15)
- **INV-2:** `canRead*(u, x)` ⇔ `x` matches `*ReadFilter(u)` for all inputs.
- **INV-3:** Every tenant-owned table has `tenant_id`, RLS enabled+forced, and a policy.
- **INV-4:** Internal notes never appear in any requester-scoped response. (Acceptance #9)
- **INV-5:** Ticket create/status-change writes both `ticket_history` and `audit_logs`
  in one transaction. (Acceptance #7, #8)
