# FlowDesk ITSM — Build Plan Overview

This `docs/` set turns the master spec
(`FlowDesk_ITSM_Architecture_and_AI_Coding_Prompt.md`) into a sequenced, buildable
plan that fixes the architectural gaps found in review.

## Read in this order

1. **[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)** — binding ADRs (RLS,
   authz engine, schema rules). Everything inherits from these.
2. **Phase docs** below — each is independently shippable and additive.

## Phases

| Phase | Title | Theme | Status |
|------|-------|-------|--------|
| [1](phases/PHASE-1-foundation.md) | Foundation | Auth, tenant, teams, RBAC, RLS, audit, seed | **Complete** |
| [2](phases/PHASE-2-tickets.md) | Tickets | Ticket CRUD, queue, detail, comments, history, attachments | **Complete** |
| [3](phases/PHASE-3-admin.md) | Admin | Users, teams, roles, ticket config | **Complete** |
| [4](phases/PHASE-4-tasks-slas.md) | Tasks & SLAs | Linked tasks, SLA policies, idempotent SLA worker, escalations | **Complete** |
| [5](phases/PHASE-5-service-catalog.md) | Service Catalog | Catalog items, dynamic forms, approvals + chains, routing | Planned |
| [6](phases/PHASE-6-ai.md) | AI | aiService abstraction, mocks, classify/summarize/draft, AIRequest logging | Planned |
| [7](phases/PHASE-7-integrations.md) | Integrations | Workflow engine, email-to-ticket, Slack/Teams, webhooks, API keys | Planned |
| [8](phases/PHASE-8-hardening.md) | Production Hardening | Observability, rate limits, MFA, security/load tests, billing | Planned |

## Phase doc format

Each phase doc contains: **Goal**, **Prerequisites**, **Deliverables**, **Schema
changes**, **API surface**, **UI surface**, **Tasks (ordered)**, **ADR ties**,
**Acceptance tests covered**, **Explicit cuts/deferrals**, **Definition of done**.

## Guiding principle

The make-or-break is tenant + team isolation. Phase 1 establishes it at the database
(RLS) and in the authz engine before any business feature is built, so every later
phase inherits a safe-by-default foundation. Building features before isolation would
mean retrofitting RLS onto tables that already have unscoped queries — the worst
possible sequence.
