import type { Tx } from "@/lib/db";
import type { Priority } from "@prisma/client";
import { resolveSlaPolicy } from "@/lib/sla/policy";

const WARN_FRACTION = 0.8; // warn at 80% of the window (calendar time, ADR-9)

export interface ApplySlaInput {
  ticketId: string;
  ticketType: string;
  priority: Priority;
  teamId: string;
}

/**
 * On ticket creation: resolve the SLA policy, stamp firstResponseDueAt/resolutionDueAt
 * on the ticket, and insert one sla_timers row per target (ADR-6). Calendar time only
 * (ADR-9). Runs inside the create transaction so due dates + timers commit atomically
 * with the ticket (acceptance #10). No-op if no policy matches.
 */
export async function applySla(tx: Tx, tenantId: string, input: ApplySlaInput): Promise<void> {
  const policy = await resolveSlaPolicy(tx, tenantId, {
    ticketType: input.ticketType,
    priority: input.priority,
    teamId: input.teamId,
  });
  if (!policy) return;

  const now = Date.now();
  const frDue = new Date(now + policy.firstResponseMinutes * 60_000);
  const resDue = new Date(now + policy.resolutionMinutes * 60_000);
  const frWarn = new Date(now + policy.firstResponseMinutes * 60_000 * WARN_FRACTION);
  const resWarn = new Date(now + policy.resolutionMinutes * 60_000 * WARN_FRACTION);

  await tx.ticket.update({
    where: { id: input.ticketId },
    data: { firstResponseDueAt: frDue, resolutionDueAt: resDue, dueAt: resDue },
  });

  await tx.sLATimer.createMany({
    data: [
      { tenantId, ticketId: input.ticketId, slaPolicyId: policy.id, kind: "first_response", dueAt: frDue, warnAt: frWarn },
      { tenantId, ticketId: input.ticketId, slaPolicyId: policy.id, kind: "resolution", dueAt: resDue, warnAt: resWarn },
    ],
  });
}

/** First public agent reply satisfies the first-response timer (stops that clock). */
export async function satisfyFirstResponse(tx: Tx, ticketId: string): Promise<void> {
  await tx.sLATimer.updateMany({
    where: { ticketId, kind: "first_response", satisfiedAt: null },
    data: { satisfiedAt: new Date() },
  });
}

/** Resolving the ticket satisfies the resolution timer. */
export async function satisfyResolution(tx: Tx, ticketId: string): Promise<void> {
  await tx.sLATimer.updateMany({
    where: { ticketId, kind: "resolution", satisfiedAt: null },
    data: { satisfiedAt: new Date() },
  });
}
