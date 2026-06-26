import type { Tx } from "@/lib/db";

export interface AuditInput {
  tenantId: string;
  actorId?: string | null;
  teamId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Writes an append-only audit row (ADR-8). MUST be called with the transaction
 * client from `withTenant`, so the audit row commits atomically with the change it
 * records (INV-5). The app DB role has INSERT+SELECT only on audit_logs — UPDATE/DELETE
 * are revoked, so a forged or erased audit row is rejected by the database.
 */
export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      teamId: input.teamId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? {}) as object,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
