# Phase 3 — Admin

> Admin dashboard · User management · Team management · Roles & permissions ·
> Ticket configuration (types, statuses, priorities, categories, custom-field defs).
> Inherits all ADRs, the Phase 1 spine, and the Phase 2 ticket tables. This phase makes
> the configurable-data tables from Phase 2 **editable** (ADR-5) and gives admins the
> A-to-Z control the spec promises — every action gated and audited.

## Goal

A tenant admin can open an admin area, see an overview dashboard, invite/list/suspend
users and assign their role + team, create/edit/archive teams (set manager + members),
view system roles and build custom roles with chosen permissions, and edit the ticket
configuration (types, statuses, priorities, categories, custom-field definitions) that
Phase 2 seeded read-only — with every admin route permission-gated and every mutation
writing an audit row.

## Prerequisites

- Phase 1 spine + Phase 2 ticket config tables (`ticket_statuses`, `ticket_types`,
  `priority_matrix`, `categories`) present and seeded read-only (ADR-5).
- `requirePermission`, `AuthContext`, audit helper, `withTenant` (Phase 1).
- Permission catalog includes the `admin.*`, `user.*`, `team.*`, `role.*`,
  `ticket.config.*` keys.

## Deliverables

- Admin layout + dashboard under `/app/admin/*` (master spec §21.3), entered only when
  `AuthContext` holds an admin-tier permission.
- User management: invite (creates `users` row status=invited + membership), list,
  suspend/reactivate, assign role (`user_role_assignments`) + team (`team_memberships`).
- Team management: create, edit, archive, set manager, manage members.
- Roles: list system + custom roles, create custom role, clone, assign/remove
  permissions (allow-only union, ADR-3).
- Ticket configuration: CRUD on `ticket_types`, `ticket_statuses`, `priority_matrix`,
  `categories`; manage **custom-field definitions** (new `ticket_field_defs` table) —
  the Phase 2 read-only tables become editable here (ADR-5).
- `requirePermission` on **every** admin route (ADR-3); every admin mutation writes
  `audit_logs` in the same `withTenant` tx (ADR-8).
- Tests proving acceptance #11 and #14.

## Schema changes

No new tenant tables for users/teams/roles — those exist from Phase 1. Phase 2's config
tables are reused and made editable. One new table:

- **ticket_field_defs**: id, tenantId, key, label, fieldType(text|number|select|date|
  bool), options(JSONB, for select), required(bool), visibility(JSONB), validation
  (JSONB), order, isSystem, timestamps. Drives the `tickets.customFields` JSONB
  (still **known cut: not filterable**, ADR-5). RLS enabled+forced + standard policy
  (ADR-1, INV-3).

`priority_matrix` edits recompute nothing retroactively in MVP (priority is denormalized
at write time per ADR-5); new matrix applies to future writes — surfaced in the UI.

## API surface

```
GET  /api/admin/users                 POST /api/admin/users/invite
PATCH /api/admin/users/:userId        (suspend | reactivate | assign role | assign team)

GET  /api/admin/teams                 POST /api/admin/teams
PATCH /api/admin/teams/:teamId        (edit | archive | set-manager | members)

GET  /api/admin/roles                 POST /api/admin/roles
PATCH /api/admin/roles/:roleId        GET  /api/admin/permissions

GET  /api/admin/config/tickets        PATCH /api/admin/config/tickets
  (types · statuses · priority-matrix · categories · field-defs)
GET  /api/admin/audit-logs
```

- Every route calls `requirePermission(<key>)` before any work (ADR-3); the key matches
  the resource (`user.manage`, `team.manage`, `role.manage`, `ticket.config.manage`,
  `audit.read`).
- `audit-logs` is read-only (SELECT; app role has no UPDATE/DELETE on `audit_logs`,
  ADR-8).
- Config writes validate against the system/`isSystem` flag: system rows can be
  reordered/relabeled but not deleted (keeps Phase 2 FKs intact, ADR-5).

## UI surface

`/app/admin` (dashboard: tenant overview, counts, recent audit) ·
`/app/admin/users` · `/app/admin/teams` · `/app/admin/roles` ·
`/app/admin/ticket-config` (tabs: Types · Statuses · Priorities · Categories ·
Custom Fields) · `/app/admin/audit-logs`. All under the admin layout, hidden from the
nav for users without an admin permission (master spec §21.3).

## Tasks (ordered)

1. `ticket_field_defs` table + migration (RLS enabled+forced, ADR-1).
2. Admin layout + route guard: resolve `AuthContext`, gate the whole `/app/admin`
   subtree on an admin-tier permission (ADR-3).
3. Admin dashboard page (counts + recent audit, read-only).
4. User management: invite (create user invited + membership in one tx + audit), list,
   suspend/reactivate, assign role (`user_role_assignments`), assign team
   (`team_memberships`) — each gated + audited (ADR-3, ADR-8).
5. Team management: create/edit/archive, set manager, manage members — gated + audited.
6. Roles: list system + custom, create/clone custom role, assign/remove permissions
   (allow-only union, ADR-3); `GET /permissions` catalog; audit role changes.
7. Ticket config: CRUD for types, statuses, priority-matrix, categories, field-defs;
   protect `isSystem` rows from deletion; each write audited (ADR-5, ADR-8).
8. Audit-logs viewer (filter by actor/entity/action; read-only, ADR-8).
9. Tests: every admin route refuses without the matching permission (#11 gate); admin
   mutations write `audit_logs` (#14); config edits flow through to Phase 2 tickets
   (e.g. a new status/category appears on the create form).

## ADR ties

- **ADR-2:** all admin access via `withTenant`; tenantId only from session.
- **ADR-3:** `requirePermission` on every admin route; roles are an allow-only union;
  temporary grants via `user_role_assignments.expiresAt` are assignable here (deny rules
  + field-level write remain designed-for, not evaluated — see cuts).
- **ADR-5:** Phase 2's config tables become editable here; custom-field defs drive the
  JSONB, still not filterable.
- **ADR-8:** every admin mutation writes `audit_logs` in the same transaction; the
  audit viewer is read-only (no UPDATE/DELETE grant).

## Acceptance tests covered (from master spec §30)

#11 Admin can create users, teams, roles, and ticket config.
#14 Audit log records admin changes.

## Explicit cuts / deferrals

- **Deny rules & field-level write permissions**: UI may list them as designed-for, but
  they are **not evaluated** in MVP (ADR-3).
- **Bulk user import, login/activity history, MFA reset**: deferred (spec §18.2; Phase 8).
- **SLA / workflow / notification / email / integration / AI / billing / security config
  pages**: out of scope here — those are Phases 4–8. Only the ticket-config slice of
  admin ships in Phase 3.
- **Team queue / default-assignee / team-SLA / team-automation config** (spec §18.3):
  the team CRUD ships; queue/SLA/automation team settings land with their feature phases.
- **Retroactive priority recompute** on matrix edit: not done; new matrix applies to
  future writes only (ADR-5), surfaced in the UI.
- **Real email** for invites: invite creates the user + token; SMTP send is Phase 8.

## Definition of done

- `pnpm dev`: an admin can invite a user, create a team and assign members, build a
  custom role with permissions, and edit ticket config — and each change appears in the
  audit-logs viewer.
- Every `/api/admin/*` route returns 403 without the matching permission (#11 gate);
  every admin mutation produces an `audit_logs` row in the same tx (#14).
- Config edits made here are reflected in Phase 2 ticket flows (new status/type/category
  selectable on create; field-defs render on the detail page).
- `pnpm test` green for the admin gate + audit tests, run **as the app role**.
