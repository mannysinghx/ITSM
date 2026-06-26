/**
 * Applies Row-Level Security (ADR-1) to tenant-owned tables and grants the runtime
 * app role its (deliberately limited) privileges. Run as the MIGRATOR (owner) role:
 *
 *   pnpm db:rls   (== dotenv -e .env.migrate -- tsx prisma/apply-rls.ts)
 *
 * Idempotent: safe to run after every migration. Later phases that add tenant tables
 * should append them to TENANT_TABLES and re-run.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APP_ROLE = "flowdesk_app";

// Standard tenant-owned tables: visible only within the active tenant context.
const TENANT_TABLES = [
  "teams",
  "team_memberships",
  "user_role_assignments",
  "audit_logs",
  "tenant_counters",
  // Phase 2 (tickets)
  "ticket_statuses",
  "ticket_types",
  "priority_matrix",
  "categories",
  "tickets",
  "ticket_comments",
  "ticket_history",
  "ticket_attachments",
  "ticket_watchers",
  "ticket_links",
  // Phase 3 (admin)
  "ticket_field_defs",
  // Phase 4 (tasks & SLAs)
  "tasks",
  "task_comments",
  "task_history",
  "sla_policies",
  "sla_timers",
  "business_hours",
  "holiday_calendars",
  "notifications",
  "notification_preferences",
  // Phase 5 (service catalog)
  "service_catalog_items",
  "form_definitions",
  "form_submissions",
  "approvals",
];

async function run(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

async function main() {
  // Helper: parse a GUC into a uuid, treating unset/'' as NULL (fail-closed in policies).
  await run(`
    CREATE OR REPLACE FUNCTION app_current(key text) RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting(key, true), '')::uuid
    $$;
  `);

  // --- Baseline grants for the runtime app role ---
  await run(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE};`);
  await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};`);
  // Future tables (later phases) auto-granted to the app role:
  await run(`
    ALTER DEFAULT PRIVILEGES FOR ROLE flowdesk_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};
  `);
  // The app role must NOT touch Prisma's migration bookkeeping.
  await run(`REVOKE ALL ON TABLE _prisma_migrations FROM ${APP_ROLE};`);

  // --- Standard tenant tables: tenant_id = active tenant ---
  for (const t of TENANT_TABLES) {
    await run(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    await run(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`);
    await run(`DROP POLICY IF EXISTS tenant_isolation ON ${t};`);
    await run(`
      CREATE POLICY tenant_isolation ON ${t}
      USING (tenant_id = app_current('app.current_tenant_id'))
      WITH CHECK (tenant_id = app_current('app.current_tenant_id'));
    `);
  }

  // --- append-only tables (ADR-8 / INV-5): app role may INSERT + SELECT only.
  //     FK ON DELETE CASCADE still works (cascades bypass column privileges). ---
  await run(`REVOKE UPDATE, DELETE ON TABLE audit_logs FROM ${APP_ROLE};`);
  await run(`REVOKE UPDATE, DELETE ON TABLE ticket_history FROM ${APP_ROLE};`);
  await run(`REVOKE UPDATE, DELETE ON TABLE task_history FROM ${APP_ROLE};`);

  // --- tenants: visible within active context OR to any of its members (bootstrap/switcher) ---
  await run(`ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;`);
  await run(`ALTER TABLE tenants FORCE ROW LEVEL SECURITY;`);
  await run(`DROP POLICY IF EXISTS tenant_self ON tenants;`);
  await run(`
    CREATE POLICY tenant_self ON tenants
    USING (
      id = app_current('app.current_tenant_id')
      OR EXISTS (
        SELECT 1 FROM tenant_memberships m
        WHERE m.tenant_id = tenants.id
          AND m.user_id = app_current('app.current_user_id')
      )
    )
    WITH CHECK (id = app_current('app.current_tenant_id'));
  `);

  // --- tenant_memberships: a user sees their own rows (cross-tenant), or all rows in
  //     the active tenant. Writes must target the active tenant. ---
  await run(`ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;`);
  await run(`ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;`);
  await run(`DROP POLICY IF EXISTS membership_access ON tenant_memberships;`);
  await run(`
    CREATE POLICY membership_access ON tenant_memberships
    USING (
      user_id = app_current('app.current_user_id')
      OR tenant_id = app_current('app.current_tenant_id')
    )
    WITH CHECK (tenant_id = app_current('app.current_tenant_id'));
  `);

  console.log("RLS applied: policies + grants installed for", APP_ROLE);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
