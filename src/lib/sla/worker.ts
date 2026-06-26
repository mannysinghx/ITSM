import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify, type Recipient } from "@/lib/notifications/service";

export interface SlaCheckResult {
  warnings: number;
  breaches: number;
  escalations: number;
}

/** Recipients for an SLA event: the assignee (if any) + the team's managers. */
async function recipientsFor(
  tx: Tx,
  teamId: string,
  assigneeId: string | null,
): Promise<Recipient[]> {
  const managers = await tx.teamMembership.findMany({
    where: { teamId, role: { key: "team_manager" } },
    select: { user: { select: { id: true, email: true } } },
  });
  const ids = new Map<string, Recipient>();
  for (const m of managers) ids.set(m.user.id, { userId: m.user.id, email: m.user.email });
  if (assigneeId && !ids.has(assigneeId)) {
    const a = await tx.user.findUnique({ where: { id: assigneeId }, select: { id: true, email: true } });
    if (a) ids.set(a.id, { userId: a.id, email: a.email });
  }
  return Array.from(ids.values());
}

/**
 * Background-compatible, idempotent SLA worker (ADR-9). For one tenant: warn → breach →
 * escalate, firing each event exactly once. `warnedAt`/`breachedAt` are the idempotency
 * latches — a second run after a stamp is a no-op (ADR-6). Callable headless (no HTTP,
 * no session); audit actor is null (system). The scheduler that enumerates tenants is a
 * Phase 8 concern; this processes a single tenant.
 */
export async function checkSlaBreaches(
  tenantId: string,
  now: Date = new Date(),
): Promise<SlaCheckResult> {
  return withTenant(tenantId, undefined, async (tx) => {
    const timers = await tx.sLATimer.findMany({
      where: { satisfiedAt: null },
      include: {
        ticket: {
          select: {
            id: true, ticketNumber: true, title: true, teamId: true, assigneeId: true,
            status: { select: { category: true } },
          },
        },
      },
    });

    let warnings = 0, breaches = 0, escalations = 0;

    for (const t of timers) {
      // Skip timers whose ticket is already closed out.
      if (["resolved", "closed", "cancelled"].includes(t.ticket.status.category)) continue;

      if (now >= t.dueAt && t.breachedAt === null) {
        await tx.sLATimer.update({ where: { id: t.id }, data: { breachedAt: now } });
        const recipients = await recipientsFor(tx, t.ticket.teamId, t.ticket.assigneeId);
        await notify(tx, {
          tenantId, type: "sla_breached", recipients,
          title: `SLA breached: ${t.ticket.ticketNumber}`,
          body: `${t.kind} SLA for "${t.ticket.title}" has breached.`,
          entityType: "ticket", entityId: t.ticket.id,
        });
        await writeAudit(tx, {
          tenantId, actorId: null, teamId: t.ticket.teamId,
          action: "sla.breached", entityType: "ticket", entityId: t.ticket.id,
          metadata: { kind: t.kind, timerId: t.id },
        });
        // Escalation: notify managers (already in recipients) + record the escalation.
        await writeAudit(tx, {
          tenantId, actorId: null, teamId: t.ticket.teamId,
          action: "sla.escalated", entityType: "ticket", entityId: t.ticket.id,
          metadata: { kind: t.kind, notified: recipients.map((r) => r.userId) },
        });
        breaches++;
        escalations++;
      } else if (now >= t.warnAt && t.warnedAt === null) {
        await tx.sLATimer.update({ where: { id: t.id }, data: { warnedAt: now } });
        const recipients = await recipientsFor(tx, t.ticket.teamId, t.ticket.assigneeId);
        await notify(tx, {
          tenantId, type: "sla_warning", recipients,
          title: `SLA warning: ${t.ticket.ticketNumber}`,
          body: `${t.kind} SLA for "${t.ticket.title}" is approaching its deadline.`,
          entityType: "ticket", entityId: t.ticket.id,
        });
        await writeAudit(tx, {
          tenantId, actorId: null, teamId: t.ticket.teamId,
          action: "sla.warning", entityType: "ticket", entityId: t.ticket.id,
          metadata: { kind: t.kind, timerId: t.id },
        });
        warnings++;
      }
    }

    return { warnings, breaches, escalations };
  });
}
