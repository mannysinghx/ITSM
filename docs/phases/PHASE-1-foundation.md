# Phase 1 — Foundation

> Auth · Tenant model · Teams · Memberships · RBAC engine · RLS · Audit · Seed
> Inherits all ADRs. This phase exists to make tenant/team isolation safe-by-default
> before any business feature is built.

## Goal

A running Next.js app where a user can sign up (individual or company), log in, and
land on a tenant-scoped dashboard — with isolation enforced at the database (RLS) and
authorization resolved by a real engine. No tickets yet; this is the spine.

## Prerequisites

- Node ≥ 20, pnpm, PostgreSQL ≥ 14 reachable.
- Two DB roles created: `flowdesk_migrator` (owner), `flowdesk_app` (RLS-enforced).

## Deliverables

- Next.js (App Router) + TS + Tailwind + Prisma project scaffold.
- Prisma schema for foundation tables (below) + RLS migration.
- `withTenant()` transaction wrapper + tenant-scoped Prisma access (ADR-1, ADR-2).
- Auth: signup (individual + company), login, logout, session cookie, password hashing.
- Authz engine: `AuthContext`, `requirePermission`, scope resolution, `canAccessTeam`
  (ADR-3, ADR-4).
- Audit logging helper (append-only, ADR-8).
- Seed script (individual demo + Acme Corp with teams/users/roles).
- Tests proving INV-1, INV-3, and acceptance #1, #2, #3 (foundation slice).

## Schema (foundation tables)

`users, tenants, tenant_memberships, teams, team_memberships, roles, permissions,
role_permissions, user_role_assignments, audit_logs, tenant_counters, sessions`

All tenant-owned tables carry `tenant_id`, `created_at`, `updated_at`. RLS enabled +
forced on every tenant-owned table (ADR-1). `permissions` and system `roles` are
global config (no tenant_id / nullable tenant_id) and are not RLS-restricted.

Key fields:
- **users**: id, name, email (unique), passwordHash, emailVerified, avatarUrl,
  status(active|invited|suspended), timestamps.
- **tenants**: id, name, slug(unique), type(individual|company), ownerUserId, plan,
  settings(JSONB), timestamps.
- **tenant_memberships**: id, tenantId, userId, status, timestamps. (user↔tenant)
- **teams**: id, tenantId, name, slug, description, isDefault, status, timestamps.
- **team_memberships**: id, tenantId, teamId, userId, roleId, timestamps.
- **roles**: id, tenantId(nullable=system), name, key, description,
  scope(system|tenant|team), isSystem, timestamps.
- **permissions**: id, key(unique), description, category.
- **role_permissions**: roleId, permissionId.
- **user_role_assignments**: id, tenantId, teamId(nullable), userId, roleId,
  expiresAt(nullable), createdAt. (ADR-3 temporary grants)
- **audit_logs**: id, tenantId, teamId(nullable), actorId(nullable), action,
  entityType, entityId, metadata(JSONB), ipAddress, userAgent, createdAt.
  App role: INSERT+SELECT only (ADR-8).
- **tenant_counters**: tenantId(pk), ticketSeq. (ADR-7, used in Phase 2)
- **sessions**: id, userId, activeTenantId, expiresAt, tokenHash. Server-side sessions.

## API surface

```
POST /api/auth/signup/individual   POST /api/auth/signup/company
POST /api/auth/login               POST /api/auth/logout
GET  /api/tenants/current          GET  /api/me
```

## UI surface

`/` (landing) · `/login` · `/signup` · `/signup/individual` · `/signup/company`
· `/app/dashboard` (protected, tenant-scoped shell).

## Tasks (ordered)

1. Scaffold project (Next.js App Router, TS, Tailwind, ESLint, Prisma, Zod, argon2/bcrypt).
2. DB roles + `.env` (`DATABASE_URL` app role, `MIGRATE_DATABASE_URL` owner).
3. Prisma schema (foundation tables) + initial migration.
4. RLS migration (raw SQL): enable+force RLS, policies, audit grants, app-role grants.
5. `lib/db.ts` — base client (migrate/seed only) + `withTenant()` wrapper (ADR-2).
6. Permission catalog + default roles seed constants.
7. Auth lib: password hashing, session create/verify, cookie helpers.
8. Signup flows (individual → 1 default team; company → IT Support + General Requests),
   each wrapped in one transaction (atomic provisioning).
9. Login (multi-tenant → store activeTenantId in session), logout.
10. Authz engine: `getAuthContext`, scope resolution, `requirePermission`,
    `canAccessTeam`, `requireTenantAccess`.
11. Audit helper (writes inside the caller's `withTenant` tx).
12. Protected `/app` layout + dashboard reading real tenant data.
13. Seed script (individual demo + Acme Corp).
14. Tests: RLS cross-tenant block (INV-1), signup provisioning (#1,#2), team isolation
    helper (#3 foundation), authz scope resolution.

## ADR ties

ADR-1, ADR-2 (RLS + transaction), ADR-3, ADR-4 (authz engine + team layer),
ADR-7 (counters table created), ADR-8 (append-only audit), ADR-10 (stack).

## Acceptance tests covered (from master spec §30)

#1 individual signup → individual tenant + Personal Workspace.
#2 company signup → company tenant + default teams.
#3 Team A user cannot see Team B data (foundation: helper + RLS).
#15 API rejects cross-tenant access even with guessed ids (DB-enforced via RLS).

## Explicit cuts / deferrals

- Email verification + password reset: routes stubbed, no real SMTP (Phase 8 / when
  configured).
- MFA: deferred (Phase 8).
- Tenant switcher UI: session supports it; full UI is light in Phase 1.
- Field-level write perms + deny rules: schema-ready, not evaluated (ADR-3).

## Definition of done

- `pnpm dev` serves landing/login/signup; both signup flows provision correctly.
- `pnpm test` green, including the RLS cross-tenant block test run **as the app role**.
- `pnpm seed` populates the two demo tenants.
- No app code path can query a tenant table without `withTenant`.
