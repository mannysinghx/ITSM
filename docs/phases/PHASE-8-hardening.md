# Phase 8 — Hardening

> Observability · Rate limiting · Brute-force protection · MFA · Email verification + reset (real SMTP)
> · Security tests (cross-tenant IDOR suite expanded) · Load tests · Billing/plans · Backups + encryption
> · README + ENV example + test checklist. Inherits all ADRs.
> This phase is the **final production gate**: it references all 15 acceptance tests.

## Goal

Turn the working modular monolith into a deployable, observable, defensible SaaS: real auth flows
(MFA, email verification, password reset over real SMTP), enforced rate limits and brute-force
protection, full observability per master spec §25, an expanded security test suite (the
cross-tenant IDOR suite made exhaustive), load tests, billing/plans, encrypted backups, and the
operator docs. Nothing new conceptually — everything from Phases 1–7 hardened and proven.

## Prerequisites

- Phases 1–7 complete and green.
- A secret manager available (env-injected in dev, managed in prod) per master spec §24.
- Real SMTP credentials available for the email flows.
- Deployment target with TLS termination and a backup-capable Postgres.

## Deliverables

- Observability: OpenTelemetry tracing, Prometheus metrics, Grafana dashboards, Loki log
  aggregation, Sentry error capture — wired to emit the master-spec §25 metric set.
- Rate limiting (per-IP + per-tenant + per-API-key) and brute-force protection (login lockout/backoff).
- MFA (TOTP enroll/verify, recovery codes) and real email verification + password reset over SMTP.
- Expanded security suite: cross-tenant IDOR matrix across **every** tenant-owned resource,
  permission-denial coverage, CSRF/XSS checks, file-upload scanning, API-key scope tests.
- Load tests (ticket create/list, automation dispatch, email ingestion) with target thresholds.
- Billing/plans: account, subscription, usage metering, plan limits enforced (users/teams/tickets/
  AI tokens/integrations per master spec §18.14).
- Backups + encryption at rest/in transit; backup encryption; restore drill documented.
- README, `.env.example`, and the test checklist (the 15 acceptance tests as a runnable gate).

## Schema changes (new tables + fields)

`billing_accounts, subscriptions, usage_events, api_key_activity` (new tables) plus **MFA/auth
fields on `users` and `sessions`**.

All tenant-owned, `tenant_id` + timestamps, RLS enabled + forced (ADR-1, INV-3).

Key fields:
- **billing_accounts**: id, tenantId(unique), plan(free|team|company|enterprise), status,
  billingEmail, externalCustomerId(nullable), limits(JSONB: users/teams/tickets/aiTokens/
  integrations), timestamps.
- **subscriptions**: id, tenantId, billingAccountId(FK), plan, status(active|past_due|canceled),
  periodStart, periodEnd, externalSubscriptionId(nullable), timestamps.
- **usage_events**: id, tenantId, kind(ticket_created|ai_tokens|storage_bytes|integration_call),
  quantity(numeric), occurredAt, metadata(JSONB). Append-only; rolled up against plan limits.
- **api_key_activity**: id, tenantId, apiKeyId(FK), route, method, status, ipAddress,
  occurredAt. (Master spec §18.13 "API key activity"; append-only like audit, ADR-8 posture.)
- **users** (new fields): mfaEnabled(bool), mfaSecret(encrypted, nullable),
  mfaRecoveryCodes(hashed JSONB, nullable), emailVerifiedAt(nullable),
  failedLoginCount(int), lockedUntil(nullable).
- **sessions** (new fields): mfaSatisfied(bool), ipAddress(nullable), userAgent(nullable).

`mfaSecret` is encrypted at rest; only a `secretRef`/ciphertext is stored, key from the secret
manager (master spec §24).

## API surface

```
POST /api/auth/verify-email/request   POST /api/auth/verify-email/confirm
POST /api/auth/password/reset-request POST /api/auth/password/reset-confirm
POST /api/auth/mfa/enroll             POST /api/auth/mfa/verify     POST /api/auth/mfa/disable
POST /api/auth/mfa/recovery           (consume a recovery code)
GET  /api/admin/billing               PUT  /api/admin/billing/plan
GET  /api/admin/usage                 (usage vs. limits)
GET  /metrics                         (Prometheus scrape)
GET  /api/health   GET /api/ready     (liveness/readiness)
```

Rate-limit + brute-force middleware sits in front of all auth and write routes.

## UI surface

`/app/settings/security` (MFA enroll with QR + recovery codes, active sessions) ·
`/verify-email` · `/reset-password` · `/reset-password/confirm` · `/login` extended with MFA
challenge step · `/app/admin/billing` (plan, usage vs. limits, upgrade) · operator-facing Grafana
dashboards (external, linked from README).

## Tasks (ordered)

1. OpenTelemetry instrumentation (HTTP, DB, automation dispatch); export traces + the §25 metric
   set to Prometheus; provision Grafana dashboards; ship Loki log shipping + Sentry SDK.
2. Rate-limit middleware (per-IP/tenant/api-key) and login brute-force protection
   (`failedLoginCount`/`lockedUntil` backoff).
3. Real SMTP integration; email verification request/confirm; password reset request/confirm
   (single-use, expiring, hashed tokens).
4. MFA: TOTP enroll (QR), verify, recovery codes (hashed), disable; gate session on `mfaSatisfied`.
5. Expanded security suite: cross-tenant IDOR matrix over **every** tenant-owned resource run as
   the app DB role (INV-1), permission-denial coverage (INV-2), CSRF/XSS, file-upload scanning,
   API-key scope enforcement.
6. Load tests with thresholds for ticket create/list, automation dispatch, email ingestion;
   record p95 latency + error rate against §25 metrics.
7. Billing/plans: accounts, subscriptions, `usage_events` metering, plan-limit enforcement on
   create paths (users/teams/tickets/AI tokens/integrations).
8. `api_key_activity` logging on every key use; surface in admin.
9. Backups + encryption: confirm encryption in transit (TLS) + at rest, encrypted backups, and a
   documented restore drill; audit retention policy enforced (ADR-8).
10. README + `.env.example` + test checklist mapping each of the 15 acceptance tests to a command.
11. Final gate run: all 15 acceptance tests + security suite + load thresholds green.

## ADR ties

ADR-1..ADR-4 (this phase *hardens* the RLS + authz foundation — the IDOR suite is run as the app
role, INV-1/INV-2/INV-3 made exhaustive), ADR-8 (audit retention policy + `api_key_activity`
append-only), ADR-10 (Sentry/Prometheus/Grafana/Loki/Redis are the post-MVP hooks made real).
Rate limiting + secret manager per master spec §24; observability metric set per §25.

## Acceptance tests covered (from master spec §30)

**All 15 — this phase is the final gate.** Specifically owns:
#15 API rejects cross-tenant access even when IDs are guessed (expanded IDOR matrix, app role).
Re-verifies #1–#14 as the release checklist: signup/tenant/team isolation, ticket
visibility/history/audit, internal-note invisibility, SLA application, admin config, AI mock
summary, search/filters, audit recording.

## Explicit cuts / deferrals

- Legal hold (master spec §18.13): retention policy enforced; legal hold is explicitly later.
- SSO/SCIM (Okta/Azure AD), advanced threat detection, SOC2 evidence automation: post-MVP.
- WAF / DDoS at the edge: assumed at the platform/CDN layer, not built here.
- Per-seat invoicing/payment processor: billing models limits + metering; external payment
  integration is a named later layer (`externalCustomerId` reserved).
- Multi-region / read replicas: single-region in MVP; backups + restore drill only.

## Definition of done

- All 15 acceptance tests pass via the documented test checklist commands.
- The cross-tenant IDOR suite passes for **every** tenant-owned resource, run as the app DB role.
- Login enforces rate limiting + brute-force lockout; MFA, email verification, and password reset
  work over real SMTP.
- `/metrics` exposes the §25 metric set; Grafana dashboards render; Sentry captures a forced error.
- Plan limits are enforced on create paths; usage metering records `usage_events`.
- Encrypted backups exist and a restore drill is documented; README + `.env.example` are complete.
