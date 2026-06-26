import type { Prisma } from "@prisma/client";
import { type AuthContext, scopeFor } from "@/lib/authz";

/**
 * The single ticket access gate (ADR-3, ADR-4). `canReadTicket` / `canWriteTicket`
 * decide single-object access; `ticketReadFilter` produces the Prisma where-fragment
 * for list endpoints from the SAME scope decision. INV-2 requires them to agree:
 *   canReadTicket(ctx, t)  ⇔  t matches ticketReadFilter(ctx)
 * (property-tested in tests/tickets-access.test.ts).
 */

/** Minimal ticket shape the gate needs — works for full rows or projections. */
export interface TicketAccessShape {
  teamId: string;
  requesterId: string;
  assigneeId: string | null;
}

// A valid-but-nonexistent uuid used to match zero rows when no scope is held.
const MATCH_NONE: Prisma.TicketWhereInput = {
  id: "00000000-0000-0000-0000-000000000000",
};

export function canReadTicket(ctx: AuthContext, t: TicketAccessShape): boolean {
  const scope = scopeFor(ctx, "ticket.read");
  if (!scope) return false;
  if (scope === "all") return true;
  if (scope === "team") {
    // Team members see team tickets; a requester always sees their own (ADR-4 carve-out).
    return ctx.teamIds.includes(t.teamId) || t.requesterId === ctx.userId;
  }
  // own
  return t.requesterId === ctx.userId || t.assigneeId === ctx.userId;
}

export function canWriteTicket(ctx: AuthContext, t: TicketAccessShape): boolean {
  const scope = scopeFor(ctx, "ticket.update");
  if (!scope) return false;
  if (scope === "all") return true;
  if (scope === "team") return ctx.teamIds.includes(t.teamId);
  // own — a requester may edit their own ticket (field-level limits are a later layer)
  return t.requesterId === ctx.userId;
}

/** Where-fragment mirroring canReadTicket. RLS already pins tenant; this adds team/own. */
export function ticketReadFilter(ctx: AuthContext): Prisma.TicketWhereInput {
  const scope = scopeFor(ctx, "ticket.read");
  if (!scope) return MATCH_NONE;
  if (scope === "all") return {};
  if (scope === "team") {
    return {
      OR: [{ teamId: { in: ctx.teamIds } }, { requesterId: ctx.userId }],
    };
  }
  // own
  return { OR: [{ requesterId: ctx.userId }, { assigneeId: ctx.userId }] };
}
