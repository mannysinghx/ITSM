import { withTenant } from "@/lib/db";
import { type AuthContext, ForbiddenError } from "@/lib/authz";
import { canReadTicket } from "@/lib/tickets/access";
import { NotFoundError } from "@/lib/errors";

export type SlaState = "satisfied" | "breached" | "warning" | "on_track";

function stateOf(t: { dueAt: Date; warnAt: Date; warnedAt: Date | null; breachedAt: Date | null; satisfiedAt: Date | null }, now: Date): SlaState {
  if (t.satisfiedAt) return "satisfied";
  if (t.breachedAt || now >= t.dueAt) return "breached";
  if (t.warnedAt || now >= t.warnAt) return "warning";
  return "on_track";
}

/** Live SLA timer state for the ticket detail panel (calendar time, ADR-9). */
export async function getTicketSla(ctx: AuthContext, ticketId: string, now: Date = new Date()) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: { teamId: true, requesterId: true, assigneeId: true },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");
    if (!canReadTicket(ctx, ticket)) throw new ForbiddenError();

    const timers = await tx.sLATimer.findMany({ where: { ticketId }, orderBy: { kind: "asc" } });
    return {
      basis: "calendar_time",
      timers: timers.map((t) => ({
        kind: t.kind,
        dueAt: t.dueAt,
        warnAt: t.warnAt,
        satisfiedAt: t.satisfiedAt,
        state: stateOf(t, now),
      })),
    };
  });
}
