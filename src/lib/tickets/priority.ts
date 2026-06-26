import type { Tx } from "@/lib/db";
import type { Severity, Priority } from "@prisma/client";

/**
 * Resolves priority from the tenant's configurable priority_matrix (impact × urgency)
 * at write time, to be stored denormalized on the ticket (ADR-5). Falls back to p3 if
 * the matrix is somehow incomplete.
 */
export async function resolvePriority(
  tx: Tx,
  tenantId: string,
  impact: Severity,
  urgency: Severity,
): Promise<Priority> {
  const entry = await tx.priorityMatrixEntry.findUnique({
    where: { tenantId_impact_urgency: { tenantId, impact, urgency } },
    select: { priority: true },
  });
  return entry?.priority ?? "p3";
}
