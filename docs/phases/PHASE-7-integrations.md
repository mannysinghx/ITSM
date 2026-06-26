# Phase 7 — Integrations

> Workflow/automation engine · `emitEvent` dispatcher · Email-to-ticket · Slack · Microsoft Teams
> · Webhooks · API keys. Inherits all ADRs — **ADR-9 is load-bearing here**.
> The engine runs **synchronous side-effects only**; anything with a wait/retry runs in a worker.

## Goal

A ticket lifecycle that emits events, and an automation/workflow engine that reacts to them with
the MVP action set — synchronously, idempotently, and with every run recorded in a first-class
`workflow_runs` table for debuggability. Plus the inbound/outbound channels: email-to-ticket,
Slack, Microsoft Teams, outbound webhooks, and scoped API keys. Loop protection guarantees a
`ticket.updated` action cannot infinitely re-trigger.

## Prerequisites

- Phases 1–6 complete: tickets + history + audit (INV-5), tasks, notifications-as-record,
  comments/internal notes, AI service.
- `withTenant()` and `AuthContext` available (ADR-2, ADR-3).
- A worker entrypoint exists (even if minimal) for deferred work (ADR-9).
- **Before email-to-ticket ships:** a written threat-model note (spoofing / header injection /
  malicious attachments) reviewed and linked from this doc.

## Deliverables

- `lib/events/emitEvent.ts` — central dispatcher; the **only** way ticket mutations announce
  themselves. Triggers: `ticket.created`, `ticket.updated`, `ticket.status_changed`,
  `ticket.assigned`, `comment.created`.
- `lib/automation/engine.ts` — match rules → evaluate conditions → run actions. Synchronous
  actions: `set_priority`, `assign_team`, `assign_user`, `add_tag`, `send_notification`,
  `create_task`, `add_internal_note` (ADR-9 sync set).
- Loop/idempotency guard: per-event depth/cycle cap + per-(rule,entity,event) dedupe so an
  action that re-triggers `ticket.updated` cannot recurse.
- `workflow_runs` + `workflow_run_steps` recording every dispatch, rule match, action, and outcome.
- Deferred-action path: anything with a wait/retry (webhook-with-retry, escalation elapsing,
  approval timeout) is **enqueued** to the worker, never run inline (ADR-9).
- Email-to-ticket: inbound parse → ticket/thread, threading, signature strip, attachment handling,
  allowed-senders/blocklist — behind the threat-model gate.
- Slack + Microsoft Teams outbound notifications; outbound webhooks (with retry, in worker).
- API keys: scoped, tenant-bound, hashed at rest; key activity logged.
- AI affordances on inbound email content reuse Phase 6 `aiService` (classify/priority).
- Tests: trigger→action, condition eval, loop protection, sync-vs-worker split, email-to-ticket
  parse, API-key scope enforcement, integration config audit.

## Schema changes (new tables)

`workflows, workflow_versions, workflow_runs, workflow_run_steps, automation_rules,
integrations, webhooks, api_keys, email_threads, email_messages`

All tenant-owned, with `tenant_id`, `created_at`, `updated_at`, RLS enabled + forced (ADR-1,
INV-3). `workflow_runs`/`workflow_run_steps` are first-class for debuggability (ADR-6).

Key fields:
- **workflows**: id, tenantId, teamId(nullable), name, description, status(active|disabled),
  currentVersionId(nullable), createdByUserId, timestamps.
- **workflow_versions**: id, tenantId, workflowId(FK), version(int), definition(JSONB: trigger +
  conditions + actions, per master spec §14.3), createdByUserId, createdAt. (Append-only.)
- **automation_rules**: id, tenantId, teamId(nullable), name, event, conditions(JSONB),
  actions(JSONB), enabled, priority(int, order), createdByUserId, timestamps. (Lightweight
  WHEN/IF/THEN rules; workflows are the multi-step version.)
- **workflow_runs**: id, tenantId, triggerEvent, entityType, entityId, sourceRunId(nullable, for
  cascade tracing), depth(int), ruleId(nullable), workflowVersionId(nullable),
  status(matched|skipped|completed|failed|deferred), dedupeKey, startedAt, finishedAt(nullable),
  error(nullable).
- **workflow_run_steps**: id, tenantId, runId(FK), stepIndex, actionType, input(JSONB),
  status(ok|error|deferred), output(JSONB nullable), error(nullable), createdAt.
- **integrations**: id, tenantId, kind(slack|teams|email|webhook|github|jira), name,
  config(JSONB), secretRef(nullable, secret-manager handle — not the secret), status, timestamps.
- **webhooks**: id, tenantId, integrationId(nullable), url, events(string[]), secretRef,
  active, lastStatus(nullable), lastDeliveryAt(nullable), timestamps.
- **api_keys**: id, tenantId, name, prefix, keyHash(hashed), scopes(string[]),
  createdByUserId, lastUsedAt(nullable), expiresAt(nullable), revokedAt(nullable), createdAt.
- **email_threads**: id, tenantId, ticketId(nullable FK), externalThreadId, subject,
  participants(JSONB), status, createdAt, updatedAt.
- **email_messages**: id, tenantId, threadId(FK), direction(in|out), messageId, inReplyTo
  (nullable), fromAddr, toAddrs(JSONB), bodyText, bodyHtml(nullable), headers(JSONB),
  spoofCheck(JSONB: SPF/DKIM/DMARC result), attachments(JSONB), createdAt.

Integration config changes write `audit_logs` rows (ADR-8). Secrets live in the secret manager;
tables store only a `secretRef`.

## API surface

```
GET/POST   /api/admin/workflows         GET/PUT /api/admin/workflows/:id
POST       /api/admin/workflows/:id/publish     GET /api/admin/workflows/:id/runs
GET/POST   /api/admin/automation-rules  PUT/DELETE /api/admin/automation-rules/:id
GET/POST   /api/admin/integrations      PUT/DELETE /api/admin/integrations/:id
GET/POST   /api/admin/webhooks          DELETE /api/admin/webhooks/:id
GET/POST   /api/admin/api-keys          DELETE /api/admin/api-keys/:id   (revoke)
POST       /api/inbound/email           (mailbox webhook → email-to-ticket)
GET        /api/admin/runs/:id          (workflow run + steps, for debugging)
```

Admin endpoints require `automation.manage` / `integration.manage`. Inbound email endpoint is
unauthenticated transport but gated by allowed-senders + spoof checks.

## UI surface

`/app/admin/workflows` (list + visual run history) · `/app/admin/workflows/:id` (trigger /
conditions / actions editor) · `/app/admin/automation` (WHEN/IF/THEN rules) ·
`/app/admin/integrations` (Slack, Teams, email, webhook setup) · `/app/admin/api-keys` (create
once-shown key, list, revoke) · run-detail drawer showing each step + outcome.

## Tasks (ordered)

1. `emitEvent` dispatcher: ticket/comment writes call it **after** the committing transaction;
   it opens a `workflow_run`, computes `dedupeKey`, and carries `depth`/`sourceRunId`.
2. Condition evaluator (field equals/contains, priority/team, created-via-email, etc., per §23),
   pure and unit-tested.
3. Action executors for the seven **synchronous** actions (ADR-9). Each writes a
   `workflow_run_step` and reuses the normal ticket write path so history + audit fire (INV-5).
4. Loop/idempotency guard: enforce max `depth`; refuse to start a run whose `dedupeKey`
   (rule+entity+event signature) already ran in this cascade. Property-test: a self-triggering
   `set_priority` on `ticket.updated` terminates.
5. Deferred-action split: webhook-with-retry, escalation-elapsing, approval-timeout are
   **enqueued** to the worker with `status=deferred`; never executed inline (ADR-9).
6. Workflow CRUD + append-only versioning + publish; automation-rule CRUD with ordering.
7. **Write + link the email threat-model note** (spoofing, header/markdown injection, attachment
   safety). Gate step 8 behind its sign-off.
8. Email-to-ticket: inbound parse → thread/ticket, SPF/DKIM/DMARC capture, signature strip,
   allowed-senders + blocklist, attachment scanning hook, threading via `inReplyTo`.
9. Outbound channels: Slack + Teams notification adapters (behind `integrations`); outbound
   webhook delivery in the worker with signed payload + retry.
10. API keys: generate (show once), hash at rest, scope list; middleware enforces scope per route;
    every use writes key activity.
11. Audit every integration/workflow/key config change (ADR-8); secrets via secret manager only.
12. Run-history UI reading `workflow_runs`/`workflow_run_steps`.
13. Tests: trigger→action, condition eval, loop termination, sync-vs-worker routing, email parse
    + spoof rejection, API-key scope block, integration-config audit.

## ADR ties

ADR-2 (all integration/workflow/email rows tenant-scoped via `withTenant`; tenant id from session
only, never from inbound payload — IDOR guard), ADR-6 (`workflow_runs` is a real table, not a
placeholder), ADR-8 (integration/workflow/key config audited; email threads traceable),
**ADR-9 (sync side-effects inline; wait/retry work in the worker — the central rule of this phase)**,
ADR-10 (channels/webhooks behind abstractions; Redis/worker are the post-MVP hooks made real here).

## Acceptance tests covered (from master spec §30)

#7 ticket creation writes history (engine reuses the write path that emits it).
#8 status change writes audit/history (status-change action path).
(Engine + email-to-ticket are MVP deliverables in §30's deliverable list — "Basic workflow engine".)

## Explicit cuts / deferrals

- Business-hours/escalation math: escalation *elapsing* runs in the worker; calendar-time SLA
  stays from the SLA phase (ADR-9). No business-hours math shipped silently.
- Approvals **elapsing** + SLA-warning/breach triggers: enqueued path exists; full worker logic
  is the SLA/approval worker layer, not inline here.
- GitHub, Jira, Google Workspace, M365, Zapier/n8n (master spec §18.11): `integrations.kind`
  reserves them; only Slack/Teams/email/webhook wired in MVP.
- Visual drag-drop workflow builder: MVP editor is form/JSON-backed, not a canvas.
- Inbound Slack/Teams (commands, ticket creation from chat): outbound only in MVP.

## Definition of done

- A seeded automation rule fires on `ticket.created`, runs its synchronous actions, and the run +
  steps are visible in the run-history UI.
- A self-referential rule on `ticket.updated` provably terminates (loop-protection test green).
- Webhook-with-retry and escalation are enqueued to the worker, never executed inline (ADR-9 test).
- Email-to-ticket creates a threaded ticket only after the threat-model note is signed off; spoofed
  mail is rejected.
- API keys enforce scopes; every key use and integration config change is logged/audited.
- `pnpm test` green across engine, channels, and IDOR/scope tests.
