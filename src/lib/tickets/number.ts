import type { Tx } from "@/lib/db";

/**
 * Allocates the next per-tenant ticket number via an atomic counter increment
 * (ADR-7) — race-free under concurrency, unlike MAX()+1. Must run inside the same
 * `withTenant` transaction as the ticket insert so the number and row commit together.
 */
export async function allocateTicketNumber(
  tx: Tx,
  tenantId: string,
  prefix = "TKT",
): Promise<string> {
  const rows = await tx.$queryRaw<{ ticket_seq: number }[]>`
    UPDATE tenant_counters
    SET ticket_seq = ticket_seq + 1
    WHERE tenant_id = ${tenantId}::uuid
    RETURNING ticket_seq
  `;
  if (rows.length === 0) {
    throw new Error(`No tenant_counters row for tenant ${tenantId}`);
  }
  return `${prefix}-${String(rows[0].ticket_seq).padStart(5, "0")}`;
}
