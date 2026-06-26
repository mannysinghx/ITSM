# Phase 6 — AI

> AI service abstraction · Provider-neutral router · Deterministic mocks · AIRequest logging
> · Token budget · PII redaction · Guardrails · Knowledge base · AI settings admin page.
> Inherits all ADRs. This phase makes AI **safe and deterministic-by-default** before any
> real provider key is wired in. No model key required to ship or test this phase.

## Goal

Every AI feature in the product is reachable through one abstraction
(`lib/ai/aiService.ts`) that routes by use-case to a provider, and returns **deterministic
mock output** when no API key is configured. Every call is logged, budgeted, and PII-redacted
per tenant config. Guardrails (never auto-close, never send external without admin allow, "AI
suggested" label) are enforced in the service layer, not the UI. The knowledge base lands here
because AI generates its first drafts.

## Prerequisites

- Phases 1–5 complete: tenant/RLS spine, tickets, comments/notes, statuses/priority matrix,
  teams, admin config, audit helper all live.
- `withTenant()` wrapper and `AuthContext` available (ADR-2, ADR-3).
- An admin settings surface to hang the AI settings page on.

## Deliverables

- `lib/ai/aiService.ts` — provider-neutral façade exposing the six MVP functions.
- `lib/ai/router.ts` — model router (use_case → provider/model), reads tenant AI settings.
- `lib/ai/providers/` — `mock` (default, deterministic) + one real adapter behind an interface;
  `mock` is selected whenever no key is present.
- `lib/ai/redaction.ts` — PII redaction applied to every prompt before it leaves the process.
- AIRequest logging: persist every call (use-case, tenant/team/user, tokens, cost, latency,
  redacted flag, provider, mock flag) — tenant-scoped (ADR-2).
- Token budget enforcement per tenant (and optional per team/user) with hard stop + audit.
- Guardrail layer: no auto-close, no external send without admin allow, all outputs labeled
  `aiSuggested=true`.
- Knowledge base CRUD + versioning, fed by `generateKnowledgeArticle`.
- AI settings admin page (enable/disable, provider, routing, budget, redaction, per-module toggles).
- Tests proving deterministic mock output, budget stop, redaction, guardrails, and acceptance #12.

## Schema changes (new tables)

`ai_requests, ai_outputs, ai_token_usage, knowledge_articles, knowledge_article_versions,
knowledge_feedback`

All tenant-owned tables carry `tenant_id`, `created_at`, `updated_at`, RLS enabled + forced,
policy on `tenant_id` (ADR-1, INV-3).

Key fields:
- **ai_requests**: id, tenantId, teamId(nullable), userId(nullable), useCase
  (classify|priority|team|summarize|draft|knowledge), provider, model, isMock(bool),
  redacted(bool), promptTokens, completionTokens, costUsd(numeric), latencyMs,
  status(ok|error|budget_blocked|disabled), entityType(nullable), entityId(nullable),
  errorCode(nullable), createdAt.
- **ai_outputs**: id, tenantId, aiRequestId(FK), outputType, content(JSONB),
  aiSuggested(bool, always true), accepted(nullable bool), acceptedByUserId(nullable),
  createdAt. (Separates the logged *request* from the *suggestion* a user may accept/reject.)
- **ai_token_usage**: id, tenantId, teamId(nullable), userId(nullable), periodStart,
  periodEnd, promptTokens, completionTokens, costUsd, requestCount. Rolling aggregate per
  budget window; the budget check reads here, not by scanning `ai_requests`.
- **knowledge_articles**: id, tenantId, teamId(nullable), title, slug, status
  (draft|published|archived), source(human|ai|ticket), sourceTicketId(nullable),
  currentVersionId(nullable), createdByUserId, timestamps.
- **knowledge_article_versions**: id, tenantId, articleId(FK), version(int), body(text/markdown),
  summary, aiGenerated(bool), createdByUserId, createdAt. (Append-only version history.)
- **knowledge_feedback**: id, tenantId, articleId(FK), userId(nullable), helpful(bool),
  comment(nullable), createdAt.

AI config lives in `tenants.settings.ai` (JSONB): `{ enabled, provider, routing, redaction,
budget, perModule, externalAutoResponseAllowed }`. **Every change to it writes an `audit_logs`
row** (ADR-8). No `ai_settings` table in MVP — config is tenant settings, audited on write.

## API surface

```
POST /api/ai/classify           POST /api/ai/suggest-priority
POST /api/ai/suggest-team       POST /api/ai/summarize
POST /api/ai/draft-response     POST /api/ai/generate-article
POST /api/ai/outputs/:id/accept POST /api/ai/outputs/:id/reject
GET  /api/admin/ai-settings     PUT  /api/admin/ai-settings   (requires ai.config.manage)
GET  /api/ai/usage              (tenant token usage rollup)
GET  /api/knowledge             POST /api/knowledge
GET  /api/knowledge/:id         PUT  /api/knowledge/:id        POST /api/knowledge/:id/publish
POST /api/knowledge/:id/feedback
```

All AI endpoints go through `aiService` — no route calls a provider SDK directly.

## UI surface

`/app/admin/ai` (settings: enable, provider, routing, budget, redaction, per-module toggles,
external-auto-response allow) · AI affordances on ticket detail (Summarize, Suggest priority/team,
Draft reply — all rendered with an "AI suggested" badge and accept/reject) · `/app/knowledge`
(list) · `/app/knowledge/:id` (read + feedback) · `/app/knowledge/new` + version history ·
"Save as knowledge draft" action on a resolved ticket.

## Tasks (ordered)

1. Provider interface (`AIProvider`) + `mock` provider with **deterministic** output keyed on
   input hash (same input → identical output; no clock/random). Real adapter stubbed behind the
   same interface, selected only when a key is present.
2. `router.ts`: map use_case → (provider, model) from tenant AI settings; cheap-for-classify,
   better-for-summary defaults (master spec §22.3). Falls back to `mock` when no key.
3. `redaction.ts`: redact emails/phones/secrets per tenant config **before** the prompt leaves
   the process; set `redacted=true` on the request. Redaction-by-default posture.
4. `aiService.ts`: the six functions — `classifyTicket`, `suggestPriority`, `suggestTeam`,
   `summarizeTicket`, `draftTicketResponse`, `generateKnowledgeArticle`. Each: check enabled +
   per-module toggle → check budget → redact → route → log `ai_requests` + `ai_outputs` →
   update `ai_token_usage`, all inside `withTenant` (ADR-2).
5. Budget enforcement: read `ai_token_usage` for the window; if over budget, return
   `status=budget_blocked` and write an audit row; never silently exceed.
6. Guardrail layer: stamp `aiSuggested=true` on every output; block any external send unless
   `externalAutoResponseAllowed`; expose no auto-close path at all.
7. Knowledge base: schema, CRUD, append-only versioning, publish, feedback.
8. Wire `generateKnowledgeArticle` → creates a `draft` article + version `aiGenerated=true`,
   `source=ticket` when invoked from a resolved ticket.
9. Accept/reject endpoints write `ai_outputs.accepted` + audit; accepting a suggestion that
   mutates a ticket goes through the normal ticket write path (history + audit, INV-5).
10. AI settings admin page (gated by `ai.config.manage`); every save audited (ADR-8).
11. Usage rollup endpoint + a small usage panel on the settings page.
12. Tests: deterministic mock summary (#12), redaction strips PII before provider call,
    budget hard-stop, guardrail blocks external send + auto-close, AI config change is audited,
    accept-suggestion writes ticket history.

## ADR ties

ADR-1, ADR-2 (`ai_requests`/usage/knowledge tenant-scoped + RLS, all access via `withTenant`),
ADR-3 (AI affordances gated by permission keys; `ai.config.manage` for settings), ADR-8 (every
AI config change and budget block audited), ADR-10 (provider behind an abstraction, no vendor
hardcoded — Redis/real provider are post-MVP hooks). Redaction-by-default is the standing posture.

## Acceptance tests covered (from master spec §30)

#12 AI mock summary works (deterministic, no key required).
(Partial groundwork for #11/#14 — AI settings is admin config and its changes are audited.)

## Explicit cuts / deferrals

- Real provider keys/billing: adapter exists, but MVP ships and tests on the `mock` provider.
- Duplicate detection, action-item extraction, translation, sentiment (master spec §22.1):
  designed-for via the same `aiService` shape, not implemented in MVP.
- Local/private model for sensitive tenants: router has the branch; no local runtime in MVP.
- Knowledge full-text search: list + slug only; search is Phase 8 / additive (cf. ADR-5 JSONB cut).
- External auto-response delivery: gated off by default; actual send path is Phase 7 channels.

## Definition of done

- With **no** API key set, all six functions return deterministic mock output and the ticket-detail
  AI affordances work end-to-end, each labeled "AI suggested."
- `pnpm test` green: deterministic mock summary (#12), redaction, budget stop, guardrails,
  audited AI config change.
- Every AI call writes an `ai_requests` row and updates `ai_token_usage`; no route bypasses
  `aiService`.
- No code path can auto-close a ticket or send AI output externally without the admin allow flag.
