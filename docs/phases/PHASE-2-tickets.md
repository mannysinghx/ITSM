# Phase 2 — Tickets

> Ticket CRUD · Queue (table + kanban) · Detail page · Public comments + internal notes
> · Assignment · Status changes · Attachments · History timeline.
> Inherits all ADRs and the Phase 1 spine (auth, tenants, teams, RBAC engine, RLS,
> audit, `withTenant`). This is the first business feature; it proves the authz engine
> and the configurable-data schema (ADR-3, ADR-5) on a real resource.

## Goal

An agent or requester can create a ticket, see it land in a queue (sortable table and a
status kanban), open its detail page, hold a public conversation with the requester, keep
internal notes hidden from that requester, assign it, change its status, attach files, and
read a complete history timeline — all tenant-isolated, all gated by a single
read/write decision that the list and the detail page share.

## Prerequisites

- Phase 1 complete and green: `withTenant`, RLS enabled+forced, `AuthContext`,
  `requirePermission`, `canAccessTeam`, audit helper, `tenant_counters`.
- Permission catalog includes the `ticket.*` keys with `own/team/all` scopes (Phase 1
  seeds the vocabulary; Phase 2 is the first consumer).

## Deliverables

- Prisma schema + RLS migration for the ticket tables (below), all tenant-owned tables
  RLS enabled+forced with the standard policy (ADR-1, INV-3).
- Seed of the read-only config tables: `ticket_statuses`, `ticket_types`,
  `priority_matrix`, `categories` (the spec's fixed lists — ADR-5).
- `lib/tickets/access.ts` — the single `canReadTicket` / `canWriteTicket` gates **and**
  the matching `ticketReadFilter` Prisma where-fragment, derived from the same scope
  decision (ADR-3, INV-2).
- `lib/tickets/number.ts` — ticket-number allocation via atomic `tenant_counters`
  increment + tenant format string (ADR-7).
- `lib/tickets/priority.ts` — priority resolved from `priority_matrix` (impact × urgency)
  on write, stored denormalized on the ticket (ADR-5).
- `lib/tickets/history.ts` — writes `ticket_history` + `audit_logs` in the **same**
  `withTenant` transaction as the mutation (INV-5, ADR-8).
- Ticket API routes (below), each entered through `withTenant` and gated by
  `requirePermission` + the object gate.
- UI: queue (table + kanban toggle), create form, detail page, comment/note composer,
  assignment + status controls, attachment upload, history timeline.
- Tests proving INV-2, INV-4, INV-5 and acceptance #3, #4, #5, #6, #7, #8, #9, #13.

## Schema changes (ticket tables)

`tickets, ticket_comments, ticket_history, ticket_attachments, ticket_watchers,
ticket_links, ticket_statuses, ticket_types, priority_matrix, categories`

All tenant-owned tables carry `tenant_id`, `created_at`, `updated_at`, RLS
enabled+forced + standard tenant policy (ADR-1, INV-3). Config tables
(`ticket_statuses`, `ticket_types`, `priority_matrix`, `categories`) are tenant-owned
and seeded read-only in MVP UI; they become **editable in Phase 3** (ADR-5).

Key fields:
- **tickets**: id, tenantId, ticketNumber (string, per-tenant unique, ADR-7), teamId,
  requesterId, assigneeId(nullable), title, description, typeId→ticket_types,
  categoryId→categories(nullable), statusId→ticket_statuses, impact(enum
  Low|Medium|High|Critical), urgency(same), priority(derived P1–P4, denormalized,
  ADR-5), source, channel, customFields(JSONB — **known cut: not filterable**, ADR-5),
  tags(text[]), dueAt/firstResponseDueAt/resolutionDueAt(nullable, populated in Phase 4),
  resolvedAt/closedAt(nullable), timestamps.
- **ticket_comments**: id, tenantId, ticketId, authorId, body, isInternal(bool — `true`
  = internal note, INV-4), createdAt. One table, discriminated by `isInternal`.
- **ticket_history**: id, tenantId, ticketId, actorId(nullable), field, oldValue,
  newValue, action(created|status_changed|assigned|commented|…), metadata(JSONB),
  createdAt. Append-only intent (written alongside audit, INV-5).
- **ticket_attachments**: first-class table (ADR-6): id, tenantId, ticketId,
  commentId(nullable), uploaderId, filename, contentType, byteSize, storageKey,
  createdAt. MVP stores via a `Storage` abstraction (local/disk); S3 is a post-MVP swap.
- **ticket_watchers**: id, tenantId, ticketId, userId, createdAt. (ticket↔watcher)
- **ticket_links**: id, tenantId, ticketId, linkedTicketId, relation(relates|blocks|
  duplicate|parent|child), createdAt. (linked_tickets; assets/tasks links land in
  later phases.)
- **ticket_statuses**: id, tenantId, key, name, category(open|pending|resolved|closed|
  cancelled), order, isSystem, isDefault. Seeds the spec's 12 statuses (ADR-5).
- **ticket_types**: id, tenantId, key, name, isSystem. Seeds the spec's 12 types (ADR-5).
- **priority_matrix**: id, tenantId, impact, urgency, priority(P1–P4), unique(tenantId,
  impact,urgency). Seeds the spec's matrix (ADR-5).
- **categories**: id, tenantId, name, parentId(nullable, self-FK for subcategory),
  teamId(nullable), isSystem.

## API surface

```
GET  /api/tickets                          POST /api/tickets
GET  /api/tickets/:id                       PATCH /api/tickets/:id
POST /api/tickets/:id/comments              POST /api/tickets/:id/internal-notes
POST /api/tickets/:id/assign
POST /api/tickets/:id/resolve               POST /api/tickets/:id/close
POST /api/tickets/:id/reopen
POST /api/tickets/:id/attachments           GET  /api/tickets/:id/history
```

- `GET /api/tickets` applies `ticketReadFilter(authCtx)` (ADR-3); supports filter/sort
  by status, type, priority, assignee, team, and free-text on title (custom-field filter
  is the **known cut**, surfaced in UI — ADR-5).
- Single-object routes call `canReadTicket` / `canWriteTicket` first (INV-2). Requester
  responses strip `isInternal` comments server-side (INV-4).
- `internal-notes` requires `ticket.comment.internal`; the public `comments` route does
  not expose `isInternal=true`.
- `assign`, `resolve`, `close`, `reopen` are status/assignment transitions that each
  write `ticket_history` + `audit_logs` in one tx (INV-5).

## UI surface

`/app/tickets` (queue: table ⇄ kanban toggle, filters, saved sort) ·
`/app/tickets/new` (create form: type, category, impact/urgency → live priority preview)
· `/app/tickets/:id` (detail page per master spec §21.4: header with number/status/
priority/assignee/team; main with description, conversation, internal notes, attachments,
tasks + linked tickets read-only stubs, history timeline; right panel with requester,
category, type, impact, urgency, tags, custom fields, dates). Requester-scoped detail
view hides the internal-notes section entirely (INV-4).

## Tasks (ordered)

1. Prisma schema for the 10 ticket tables + migration.
2. RLS migration (raw SQL): enable+force RLS + standard tenant policy on every new
   tenant-owned table; app-role grants (ADR-1, INV-3).
3. Seed config tables (statuses, types, priority_matrix, categories) read-only (ADR-5);
   extend Phase-1 seed tenants with the spec's demo tickets.
4. `lib/tickets/number.ts` — atomic counter allocation + tenant format string (ADR-7).
5. `lib/tickets/priority.ts` — resolve priority from `priority_matrix` on write (ADR-5).
6. `lib/tickets/access.ts` — `canReadTicket`, `canWriteTicket`, `ticketReadFilter`
   from one scope decision (ADR-3, ADR-4); requester-owns carve-out (ADR-4).
7. `lib/tickets/history.ts` — history + audit writer, called inside the mutation's
   `withTenant` tx (INV-5, ADR-8).
8. `Storage` abstraction (local disk) + attachment service (ADR-6, ADR-10).
9. Create ticket (allocate number, derive priority, default team/status, write history
   + audit) — one transaction.
10. `GET /tickets` (list via `ticketReadFilter`, filters/sort) + `GET /tickets/:id`
    (gate + strip internal notes for requester).
11. `PATCH /tickets/:id` + transition routes (assign/resolve/close/reopen) — each writes
    history + audit in one tx (INV-5).
12. Comments + internal-notes routes (INV-4).
13. Attachment upload route.
14. Queue UI (table + kanban toggle, filters; custom-field-not-filterable notice).
15. Create form with live priority preview.
16. Detail page (§21.4 layout) + composer + assignment/status controls + history
    timeline; requester variant hides internal notes.
17. Tests: INV-2 property test (`canRead ⇔ readFilter`), INV-4 (internal notes absent
    from requester responses), INV-5 (create + status-change write both tables),
    acceptance #3–#9, #13.

## ADR ties

- **ADR-1, ADR-2:** every ticket table RLS enabled+forced; all access via `withTenant`;
  tenantId only from session (INV-1, INV-3).
- **ADR-3, INV-2:** single `canReadTicket`/`canWriteTicket` gate + matching
  `ticketReadFilter`, property-tested to agree; scopes `own < team < all`.
- **ADR-4:** team access + requester-owns carve-out resolved in the authz engine, not RLS.
- **ADR-5:** `status`/`type` are FK config tables seeded read-only; priority derived from
  `priority_matrix`; `customFields` JSONB known-not-filterable, surfaced in UI.
- **ADR-6:** `ticket_attachments` is a first-class table from the start.
- **ADR-7:** `ticketNumber` via atomic `tenant_counters` increment + tenant format string.
- **ADR-8 / INV-4 / INV-5:** internal notes never in requester responses; create and
  status-change write `ticket_history` + `audit_logs` in one transaction.
- **ADR-10:** Next.js/Prisma/Zod/shadcn; storage behind an abstraction.

## Acceptance tests covered (from master spec §30)

#3 Team A user cannot see Team B tickets (via `ticketReadFilter`).
#4 Requester can only see their own tickets (own-scope + carve-out).
#5 Agent can see tickets in assigned teams (team scope).
#6 Tenant admin can see all tenant tickets (all scope).
#7 Ticket creation writes ticket history (INV-5).
#8 Ticket status change writes audit/history (INV-5).
#9 Internal notes are not visible to requester (INV-4).
#13 Search and filters work on ticket list.

## Explicit cuts / deferrals

- **SLA fields** (`due_at`, `*_due_at`, `sla_policy_id`) exist on the schema but are not
  computed here — populated in Phase 4 (ADR-9). Detail-page SLA timer is a static label.
- **Custom-field filtering**: JSONB stored and displayed, **not filterable** (ADR-5);
  GIN index is the additive future path. Limitation shown in the UI, not hidden.
- **Tasks**: `linked_tasks` panel is a read-only stub; full task CRUD is Phase 4.
- **Linked assets / knowledge suggestions**: detail-page stubs only (Phases 5/6).
- **Config editing**: status/type/priority/category tables are read-only here; editing
  is Phase 3 (ADR-5).
- **Attachment storage**: local disk via the `Storage` abstraction; S3 is post-MVP.
- **Watchers/notifications**: `ticket_watchers` table exists; email notification is
  Phase 4.

## Definition of done

- `pnpm dev`: create → queue → detail → comment/note → assign → status change →
  attach → history all work against real APIs, tenant-isolated.
- `pnpm test` green, including the INV-2 property test, INV-4, INV-5, and acceptance
  #3–#9 and #13, run **as the app role**.
- No ticket query reaches the DB outside `withTenant`; no route resolves access without
  the single object gate; no requester response contains an internal note.
- Seed produces the spec's demo tickets across both Phase-1 tenants.
