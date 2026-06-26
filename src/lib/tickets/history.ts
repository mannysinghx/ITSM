import type { Tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export interface HistoryInput {
  tenantId: string;
  ticketId: string;
  teamId?: string | null;
  actorId?: string | null;
  action: string; // created | status_changed | assigned | commented | updated | ...
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Writes a ticket_history row AND an audit_logs row in the caller's `withTenant`
 * transaction (INV-5, ADR-8) — so a mutation and its trail commit atomically. Both
 * tables are append-only for the app role.
 */
export async function recordHistory(tx: Tx, input: HistoryInput): Promise<void> {
  await tx.ticketHistory.create({
    data: {
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      actorId: input.actorId ?? null,
      action: input.action,
      field: input.field ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      metadata: (input.metadata ?? {}) as object,
    },
  });

  await writeAudit(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    teamId: input.teamId ?? null,
    action: `ticket.${input.action}`,
    entityType: "ticket",
    entityId: input.ticketId,
    metadata: {
      field: input.field ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      ...(input.metadata ?? {}),
    },
  });
}
