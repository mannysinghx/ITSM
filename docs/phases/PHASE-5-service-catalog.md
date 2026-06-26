# Phase 5 — Service Catalog

> Service catalog items · dynamic forms (`form_schema` JSON) · request portal ·
> approvals with chains · routing rules to teams.
> Inherits all ADRs. This phase lets requesters self-serve via configurable forms that
> create real tickets, route them to the right team, and gate them behind approval chains.

## Goal

A requester opens the portal, picks a catalog item, fills a dynamically-rendered form
(field types per master spec §13), and submits — which **creates a ticket**, applies the
item's defaults (priority/SLA/team), and, when required, opens an approval chain. An
admin can author catalog items, their form schema, routing rules, and approval chains.
Approval decisions are auditable and drive `approval.requested/approved/rejected` events.

## Prerequisites

- Phase 1 (auth, tenant model, RBAC, `withTenant`, audit, RLS).
- Phase 2 (tickets) — submission creates a ticket; routing sets its `teamId`.
- Phase 4 (SLA policies, notifications) — catalog defaults reference an SLA policy;
  approval requests notify approvers via the Phase 4 notification service.

## Deliverables

- Prisma models + RLS migration for: `service_catalog_items, form_definitions,
  form_submissions, approvals`.
- Catalog item CRUD (admin): name, team, default priority/SLA, approval flag/chain,
  routing rule, visibility.
- Form definition authoring (`form_schema` JSON) + a renderer covering the §13 field
  types; Zod-validated submissions.
- Request portal: browse catalog → render form → submit → **ticket created**.
- Routing resolver: pick target team from the item's rule (and submitted field values).
- Approvals as a **first-class table** with `sequence` (chains), `status`,
  `decidedBy`/`decidedAt`; approve/reject endpoints + an approvals inbox UI.
- Emits `approval.requested` on submit, `approval.approved`/`approval.rejected` on
  decision (ADR-6) — consumable by the automation engine.
- Tests: submission creates a ticket; approval chain advances sequentially; non-approver
  is rejected; audit written on every decision.

## Schema (Phase 5 tables)

`service_catalog_items, form_definitions, form_submissions, approvals`

All tenant-owned, carry `tenant_id`, `created_at`, `updated_at`; RLS enabled + forced
with the standard tenant policy (ADR-1, INV-3). Access via `withTenant` only (ADR-2).

Key fields:
- **service_catalog_items**: id, tenantId, teamId(nullable, target/default team),
  name, description, category, formDefinitionId, defaultPriority(p1..p4),
  defaultSlaPolicyId(nullable, → Phase 4 `sla_policies`), approvalRequired(bool),
  approvalChain(JSONB: ordered approver specs — user/role/team-manager),
  routingRule(JSONB: team resolution), visibility(public|internal|team), status,
  timestamps.
- **form_definitions**: id, tenantId, name, schema(JSONB — ordered fields:
  `{key, label, type, required, options?, validation?}`), version, timestamps.
  Field `type` ∈ §13 set: text, textarea, dropdown, multi_select, checkbox, date,
  datetime, user_picker, team_picker, asset_picker, attachment, number, currency, url,
  email, phone, rich_text.
- **form_submissions**: id, tenantId, catalogItemId, formDefinitionId, submittedBy,
  values(JSONB, Zod-validated against schema), ticketId(nullable → the created ticket),
  createdAt.
- **approvals**: id, tenantId, ticketId(nullable)/submissionId(nullable), **sequence**
  (int, position in chain), approverUserId(nullable), approverRole(nullable),
  **status**(pending|approved|rejected|skipped), **decidedBy**(nullable),
  **decidedAt**(nullable), comment(nullable), createdAt. First-class table (ADR-6);
  one row per chain step.

## API surface

```
GET  /api/catalog                          (portal: visible items)
GET  /api/catalog/{itemId}                 (item + form schema)
POST /api/catalog/{itemId}/submit          (validate → create ticket → maybe approvals)
GET  /api/admin/catalog                    POST /api/admin/catalog
PATCH /api/admin/catalog/{itemId}
GET  /api/admin/forms                      POST /api/admin/forms
GET  /api/approvals                        (approvals inbox: my pending)
POST /api/approvals/{id}/approve           POST /api/approvals/{id}/reject
```

## UI surface

`/app/service-catalog` (portal grid, visibility-filtered) · catalog item → dynamic form
page (renders §13 field types from `form_schema`) · `/app/approvals` (inbox of pending
approvals with approve/reject) · `/app/admin/service-catalog` (item editor: defaults,
routing rule, approval chain) · `/app/admin/forms` (form schema editor — JSON-backed).
Submission confirmation links to the created ticket.

## Tasks (ordered)

1. Prisma models for the four Phase 5 tables; migration.
2. RLS migration (raw SQL): enable+force RLS + tenant policy on all four (INV-3).
3. Catalog item CRUD (admin) + form definition CRUD; all via `withTenant`.
4. Form renderer: map `form_schema` field types (§13) to inputs; build the Zod schema
   from the definition for server-side validation.
5. Routing resolver: `resolveTeam(item, values)` → target `teamId`.
6. Submission flow (one tx): validate values → create `form_submissions` → **create a
   ticket** (source = portal, apply defaultPriority, resolve team, set SLA policy →
   reuses Phase 4 due-date stamping) → write ticket history + audit (ADR-8).
7. If `approvalRequired`: materialize `approvals` rows from `approvalChain` (sequence
   0..n), set ticket status `waiting_on_approval`, emit `approval.requested` for
   sequence 0, notify the approver (Phase 4 notifications).
8. Approve/reject endpoints: authorize the actor is the step's approver; stamp
   `status`/`decidedBy`/`decidedAt`; **audit the decision** (ADR-8); emit
   `approval.approved`/`approval.rejected`.
9. Chain advance: on approve, activate next `sequence` (emit `approval.requested`,
   notify); when the last step approves, move ticket off `waiting_on_approval`. On
   reject, stop the chain and set ticket status accordingly.
10. Approvals inbox UI + portal + admin editors.
11. Tests: submission → ticket (with defaults/routing); chain advances sequentially;
    non-approver rejected; audit on every decision; rejection halts chain.

## ADR ties

- **ADR-2** — all catalog/form/approval DB access via `withTenant`; tenantId from session.
- **ADR-6** — `approvals` is a first-class table with `sequence`/`status`/`decidedBy`/
  `decidedAt`; the automation events `approval.requested/approved/rejected` depend on
  this persisted state.
- **ADR-8** — every approval decision writes an append-only audit row in the same tx.
- **ADR-9** — approval **elapsing / waiting / reminders** are async and **deferred to the
  worker** (Phase 4+/7). MVP advances the chain synchronously on each human decision; no
  timed approval expiry inline.

## Acceptance tests covered (from master spec §30)

This phase adds catalog/approval coverage beyond the §30 numbered list; phase-local
invariants: **a catalog submission creates a ticket** with the item's defaults and
routed team; an **approval chain advances strictly by `sequence`**, only the designated
approver can decide a step, and **every decision is audited** (ADR-8). Cross-tenant
isolation (#15) continues to hold via RLS + `withTenant` on the new tables.

## Explicit cuts / deferrals

- **Drag-and-drop form builder**: MVP edits `form_schema` as JSON; visual builder later.
- **Approval timeouts / reminders / auto-escalation**: deferred to the worker (ADR-9);
  no timed elapsing in MVP.
- **Conditional form logic** (show field B if A = x) and cross-field validation beyond
  required/type: deferred.
- `asset_picker` / `attachment` field types render but rely on Phase-later asset & file
  storage; MVP stores references/placeholders.
- Catalog analytics and SLA-by-catalog reporting: deferred (reporting phase).
- Parallel (non-sequential) approval chains: MVP is sequential-only via `sequence`.

## Definition of done

- `pnpm dev`: portal lists visible catalog items; selecting one renders its form from
  `form_schema`; submitting validates and **creates a ticket** with defaults + routed team.
- Approval-required items open a sequential chain; approve/reject advances or halts it;
  the approvals inbox shows pending steps for the right approver only.
- Every approval decision writes an append-only audit row; `approval.requested/approved/
  rejected` events are emitted for the automation engine.
- No catalog/form/approval query reaches the DB without `withTenant`; RLS enabled+forced
  on all four tables (INV-3).
