import { PrismaClient } from "@prisma/client";
import { checkSlaBreaches } from "@/lib/sla/worker";
import { processDeferredSteps } from "@/lib/integrations/channels";

/**
 * Cross-tenant worker runner (the scheduled entrypoint).
 *
 * Enumerating *all* tenants is the one operation that cannot run under normal RLS (there
 * is no tenant context yet). It uses a dedicated admin connection (the `flowdesk_migrator`
 * owner role, which carries BYPASSRLS) — a controlled platform escape hatch, used ONLY to
 * list tenant ids. The actual per-tenant work (`checkSlaBreaches`, `processDeferredSteps`)
 * still runs through the RLS-enforced app role via `withTenant`.
 */
const globalForAdmin = globalThis as unknown as { adminPrisma?: PrismaClient };

function adminClient(): PrismaClient {
  if (!globalForAdmin.adminPrisma) {
    const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
    globalForAdmin.adminPrisma = new PrismaClient({ datasources: { db: { url } } });
  }
  return globalForAdmin.adminPrisma;
}

export async function listAllTenantIds(): Promise<string[]> {
  const rows = await adminClient().$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM tenants`;
  return rows.map((r) => r.id);
}

export interface WorkerSummary {
  tenants: number;
  slaWarnings: number;
  slaBreaches: number;
  slaEscalations: number;
  deferredDelivered: number;
  failures: number;
}

/** Runs the SLA worker and the deferred-automation worker for every tenant. Idempotent. */
export async function runAllWorkers(now: Date = new Date()): Promise<WorkerSummary> {
  const ids = await listAllTenantIds();
  const summary: WorkerSummary = {
    tenants: ids.length, slaWarnings: 0, slaBreaches: 0, slaEscalations: 0,
    deferredDelivered: 0, failures: 0,
  };
  for (const tenantId of ids) {
    try {
      const sla = await checkSlaBreaches(tenantId, now);
      summary.slaWarnings += sla.warnings;
      summary.slaBreaches += sla.breaches;
      summary.slaEscalations += sla.escalations;
      const def = await processDeferredSteps(tenantId);
      summary.deferredDelivered += def.delivered;
    } catch (e) {
      summary.failures++;
      console.error(`[workers] tenant ${tenantId} failed:`, e);
    }
  }
  return summary;
}
