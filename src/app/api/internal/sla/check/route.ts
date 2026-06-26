import { requireAuth } from "@/lib/auth/require";
import { requirePermission } from "@/lib/authz";
import { checkSlaBreaches } from "@/lib/sla/worker";
import { ok, handleError } from "@/lib/api";

/**
 * Manual trigger for the SLA worker, scoped to the caller's tenant (ADR-9). A durable
 * cross-tenant scheduler is a Phase 8 concern; checkSlaBreaches() is also callable
 * headless (no HTTP) by a cron/queue.
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "admin.view");
    const result = await checkSlaBreaches(ctx.tenantId);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
