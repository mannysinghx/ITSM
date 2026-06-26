# Acceptance Test Checklist (§30) — Release Gate

The 15 acceptance tests from the master spec, mapped to automated coverage. Run the whole
suite with `pnpm test` (executes **as the `flowdesk_app` DB role**, so RLS is in force).

| # | Acceptance criterion | Covered by | Command |
|---|----------------------|-----------|---------|
| 1 | Individual signup → individual tenant + Personal Workspace | `tests/isolation.test.ts` | `pnpm test isolation` |
| 2 | Company signup → company tenant + default teams | `tests/isolation.test.ts` | `pnpm test isolation` |
| 3 | Team A user cannot see Team B tickets | `tests/tickets.test.ts`, `tests/isolation.test.ts` | `pnpm test tickets` |
| 4 | Requester sees only their own tickets | `tests/tickets-access.test.ts` | `pnpm test tickets-access` |
| 5 | Agent sees tickets in assigned teams | `tests/tickets-access.test.ts` | `pnpm test tickets-access` |
| 6 | Tenant admin sees all tenant tickets | `tests/tickets-access.test.ts` | `pnpm test tickets-access` |
| 7 | Ticket creation writes ticket history | `tests/tickets.test.ts` | `pnpm test tickets` |
| 8 | Status change writes audit/history | `tests/tickets.test.ts` | `pnpm test tickets` |
| 9 | Internal notes invisible to requester | `tests/tickets.test.ts` | `pnpm test tickets` |
| 10 | SLA due dates applied on ticket creation | `tests/sla.test.ts` | `pnpm test sla` |
| 11 | Admin can create users/teams/roles/ticket config | `tests/admin.test.ts` | `pnpm test admin` |
| 12 | AI mock summary works (deterministic, no key) | `tests/ai.test.ts` | `pnpm test ai` |
| 13 | Search and filters work on ticket list | `tests/tickets.test.ts` (team filter), live queue | `pnpm test tickets` |
| 14 | Audit log records admin changes | `tests/admin.test.ts` | `pnpm test admin` |
| 15 | API rejects cross-tenant access even with guessed ids | `tests/idor.test.ts`, `tests/isolation.test.ts` | `pnpm test idor` |

## Phase-local invariants (beyond §30)

| Invariant | Covered by |
|-----------|-----------|
| INV-1 RLS blocks cross-tenant reads/writes (app role) | `tests/isolation.test.ts`, `tests/idor.test.ts` |
| INV-2 `canRead*` ⇔ `*ReadFilter` agree | `tests/tickets-access.test.ts` |
| INV-4 internal notes never in requester responses | `tests/tickets.test.ts` |
| INV-5 create/status-change write history + audit in one tx | `tests/tickets.test.ts` |
| SLA worker idempotency (fires each event once) | `tests/sla.test.ts` |
| Approval chain advances by sequence; rejection halts | `tests/catalog.test.ts` |
| Automation loop protection (self-trigger terminates) | `tests/automation.test.ts` |
| ADR-9 sync-vs-worker split (webhook deferred) | `tests/automation.test.ts` |
| API-key hash/scope/revoke; email spoof reject | `tests/integrations.test.ts` |
| Brute-force lockout, MFA, password reset, plan limits | `tests/hardening.test.ts` |

## Operational probes

```bash
curl localhost:3000/api/health   # liveness  → {"status":"ok"}
curl localhost:3000/api/ready    # readiness → checks DB
curl localhost:3000/metrics      # Prometheus exposition (minimal)
```

## Full gate

```bash
pnpm typecheck && pnpm test && pnpm build
```
All green = release gate satisfied for the implemented scope.
