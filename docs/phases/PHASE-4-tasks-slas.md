# Phase 4 — Tasks & SLAs

> Tasks (standalone or ticket-linked) · SLA policies · SLA timers as first-class rows
> · idempotent SLA worker · escalations · in-app + email-record notifications.
> Inherits all ADRs. This phase makes time-bound commitments measurable and turns
> them into events without ever firing the same event twice.

## Goal

A tenant can define SLA policies, have first-response/resolution due dates stamped on
tickets **at creation**, watch live timers on the ticket detail page, and let a
background-safe worker warn → breach → escalate exactly once per timer per event. Tasks
exist as their own work items (standalone or hung off a ticket) with an assignee, due
date, and status board. Notifications land in-app and as email **records** — no real
SMTP required.

## Prerequisites

- Phase 1 (auth, tenant model, RBAC engine, `withTenant`, audit helper, RLS).
- Phase 2 (tickets exist: `tickets`, `ticket_history`, statuses/priorities) — SLA timers
  attach to tickets and resolution stops the clock.
- Phase 3 (admin shell) for the SLA-policy config screens.

## Deliverables

- Prisma models + RLS migration for: `tasks, task_comments, task_history, sla_policies,
  sla_timers, business_hours, holiday_calendars, notifications, notification_preferences`.
- Task CRUD (standalone + ticket-linked), assignee, due date, status board, history.
- SLA policy CRUD (match by ticket type / priority / team) + matching resolver.
- SLA due-date stamping **on ticket creation** (`firstResponseDueAt`, `resolutionDueAt`)
  and one `sla_timers` row per active target (ADR-6).
- `checkSlaBreaches()` — a **background-compatible, idempotent** worker that warns,
  breaches, escalates, audits, and notifies; safe to re-run (ADR-9).
- Escalation on breach (reassign / notify manager) with an audit row (ADR-8).
- Notification service: DB-record notifications + an email-service abstraction
  (mock transport, no SMTP) writing one `notifications` row per recipient.
- Tests proving acceptance #10 (due dates on creation) and worker idempotency.

## Schema (Phase 4 tables)

`tasks, task_comments, task_history, sla_policies, sla_timers, business_hours,
holiday_calendars, notifications, notification_preferences`

All tenant-owned, carry `tenant_id`, `created_at`, `updated_at`; RLS enabled + forced
with the standard tenant policy (ADR-1, INV-3). Tenant-scoped access via `withTenant`
only (ADR-2).

Key fields:
- **tasks**: id, tenantId, teamId, ticketId(nullable → standalone), title, description,
  status(todo|in_progress|blocked|done|cancelled), priority(p1..p4), assigneeId(nullable),
  dueAt(nullable), createdBy, updatedBy, timestamps.
- **task_comments**: id, tenantId, taskId, authorId, body, timestamps.
- **task_history**: id, tenantId, taskId, actorId, action, oldValue(JSONB), newValue(JSONB),
  createdAt. Status/assignee/due changes write here.
- **sla_policies**: id, tenantId, teamId(nullable), name, description,
  ticketType(nullable), priority(nullable), firstResponseMinutes, resolutionMinutes,
  businessHoursId(nullable, **unused in MVP**), enabled, timestamps. NULL match-fields =
  wildcard; most-specific match wins.
- **sla_timers**: id, tenantId, ticketId, slaPolicyId, kind(first_response|resolution),
  **dueAt**, **warnAt** (e.g. 80% of window), startedAt, pausedAt(nullable),
  **warnedAt(nullable)**, **breachedAt(nullable)**, satisfiedAt(nullable), createdAt.
  First-class row (ADR-6). `warnedAt`/`breachedAt` are the idempotency latches: the
  worker only fires an event when the column is still NULL, then stamps it.
- **business_hours**: id, tenantId, name, timezone, weeklySchedule(JSONB), isDefault,
  timestamps. **Seeded but not consulted by MVP math** (calendar time — ADR-9).
- **holiday_calendars**: id, tenantId, name, dates(JSONB array), timestamps.
  **Seeded but not consulted by MVP math** (ADR-9).
- **notifications**: id, tenantId, userId, title, body, type(ticket_created|
  ticket_assigned|comment_added|sla_warning|sla_breached|task_due|...),
  entityType(nullable), entityId(nullable), readAt(nullable), createdAt.
- **notification_preferences**: id, tenantId, userId, eventType, inApp(bool),
  email(bool), timestamps. Default-on; resolver falls back to defaults when no row.

## API surface

```
GET  /api/tasks                 POST /api/tasks
GET  /api/tasks/{taskId}        PATCH /api/tasks/{taskId}
DELETE /api/tasks/{taskId}      POST /api/tasks/{taskId}/comments
GET  /api/tickets/{id}/tasks    (ticket-linked tasks)
GET  /api/tickets/{id}/sla      (live timer state for detail page)
GET  /api/admin/config/slas     POST /api/admin/config/slas
PATCH /api/admin/config/slas/{id}
GET  /api/notifications         POST /api/notifications/{id}/read
POST /api/internal/sla/check    (manual trigger → checkSlaBreaches; cron/worker entry)
```

`checkSlaBreaches()` is also exported as a plain function so a cron, queue worker, or
test can call it directly with no HTTP layer (ADR-9, background-compatible).

## UI surface

`/app/tasks` (board: To Do · In Progress · Blocked · Done) · task drawer/detail ·
`/app/tickets/[id]` SLA panel (live countdown, **labeled "calendar time"**, warning/
breach badges) + linked-tasks section · `/app/admin/slas` (policy list + editor) ·
in-app notification bell/list. SLA UI states: On track · Warning · **Breached**.

## Tasks (ordered)

1. Prisma models for the nine Phase 4 tables; migration.
2. RLS migration (raw SQL): enable+force RLS + tenant policy on all nine (INV-3).
3. Task service + CRUD (standalone + ticket-linked); writes `task_history` and audit
   inside the caller's `withTenant` tx (ADR-2, ADR-8).
4. Task board UI + task drawer; due-date and assignee editing.
5. SLA policy CRUD + `resolveSlaPolicy(ticket)` (type/priority/team match, most-specific
   wins, NULL = wildcard).
6. Hook ticket creation: resolve policy → stamp `firstResponseDueAt`/`resolutionDueAt`
   → insert `sla_timers` rows with `dueAt`/`warnAt` (calendar math). Acceptance #10.
7. Stop/satisfy logic: first public agent reply satisfies first_response timer; resolve
   satisfies resolution timer (`satisfiedAt` set, excluded from worker).
8. `checkSlaBreaches()` — idempotent worker:
   - load active timers (`satisfiedAt IS NULL`) for unresolved tickets, per tenant via
     `withTenant`;
   - if `now ≥ warnAt` **and** `warnedAt IS NULL` → create `sla_warning` notifications,
     audit, set `warnedAt`;
   - if `now ≥ dueAt` **and** `breachedAt IS NULL` → create `sla_breached` notifications,
     run escalation, audit, set `breachedAt`;
   - re-running after each stamp is a no-op (latches prevent duplicate events).
9. Escalation action on breach (notify team manager / reassign) + audit row (ADR-8).
10. Notification service: `notify(event, recipients, payload)` → resolve
    `notification_preferences` → write `notifications` rows + call email abstraction
    (mock transport logs/records; no SMTP).
11. Notification bell + list UI; mark-as-read.
12. Tests: due dates on creation (#10); worker fires warn/breach once then no-ops on
    re-run; resolved ticket's timer is skipped; task history written on status change.

## ADR ties

- **ADR-2** — all task/SLA/notification DB access via `withTenant`; tenantId from session.
- **ADR-6** — `sla_timers` is a first-class table; `warnedAt`/`breachedAt` give the
  worker its idempotency, so each event fires exactly once on any re-run.
- **ADR-8** — escalations and SLA breaches write append-only audit rows in the same tx.
- **ADR-9** — MVP SLA uses **calendar time**, surfaced in UI as such; `checkSlaBreaches()`
  is background-compatible (callable headless). Business-hours / holiday math is an
  explicit deferral. Escalation runs in the worker, not inline on the request.

## Acceptance tests covered (from master spec §30)

#10 SLA due dates are applied on ticket creation (policy resolved, `firstResponseDueAt`
/`resolutionDueAt` stamped, timer rows inserted).
Plus phase-local invariant: **the worker is idempotent** — a second `checkSlaBreaches()`
run produces zero additional notifications/audit rows (relies on `warnedAt`/`breachedAt`).

## Explicit cuts / deferrals

- **Business-hours & holiday math: deferred** (ADR-9). `business_hours` /
  `holiday_calendars` tables seeded and editable, but MVP timers use calendar time;
  UI labels timers "calendar time."
- SLA **pause** conditions (waiting-on-requester/vendor) — `pausedAt` column exists,
  not evaluated in MVP.
- Update-SLA, Approval-SLA, Vendor-SLA timer kinds: schema allows `kind`, MVP ships
  first_response + resolution only.
- Real SMTP / Slack / Teams delivery: email is a record + mock transport (Phase 7/8).
- Worker scheduling (cron/queue infra): MVP exposes the function + a manual trigger
  endpoint; durable scheduling is Phase 8.
- Task dependencies & checklists: master spec mentions them; not modeled in MVP.

## Definition of done

- `pnpm dev`: tasks board works (standalone + ticket-linked); ticket detail shows live
  calendar-time timers and warning/breach badges; notification bell lists records.
- Creating a ticket stamps due dates and inserts `sla_timers` rows (acceptance #10).
- `checkSlaBreaches()` runs headless; first run warns/breaches/escalates + audits +
  notifies; **second run is a no-op** (idempotency proven by test).
- Every escalation and breach has a matching append-only audit row.
- No task/SLA/notification query reaches the DB without `withTenant`.
