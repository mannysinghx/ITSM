import { describe, it, expect } from "vitest";
import {
  canReadTicket,
  ticketReadFilter,
  type TicketAccessShape,
} from "@/lib/tickets/access";
import type { AuthContext } from "@/lib/authz";
import type { Prisma } from "@prisma/client";

function ctx(keys: string[], teamIds: string[] = [], userId = "u1"): AuthContext {
  return { userId, tenantId: "t", teamIds, permissionKeys: new Set(keys) };
}

/** Evaluates the (simple OR-of-conditions) where-fragment against a ticket in JS. */
function matches(where: Prisma.TicketWhereInput, t: TicketAccessShape, userId: string): boolean {
  // No-scope sentinel: { id: "000...0" } matches nothing.
  if ("id" in where && where.id === "00000000-0000-0000-0000-000000000000") return false;
  // {} matches everything (all-scope).
  if (Object.keys(where).length === 0) return true;
  const or = (where.OR ?? []) as Prisma.TicketWhereInput[];
  return or.some((cond) => {
    if (cond.requesterId && cond.requesterId === t.requesterId) return true;
    if (cond.assigneeId && cond.assigneeId === t.assigneeId) return true;
    const inList = (cond.teamId as { in?: string[] } | undefined)?.in;
    if (inList && inList.includes(t.teamId)) return true;
    return false;
  });
}

// All combinations of scope × ticket relationship.
const SCOPES = [
  [],
  ["ticket.read.own"],
  ["ticket.read.team"],
  ["ticket.read.all"],
];

const TICKETS: TicketAccessShape[] = [
  { teamId: "team-a", requesterId: "u1", assigneeId: null },   // own as requester
  { teamId: "team-a", requesterId: "x", assigneeId: "u1" },     // own as assignee
  { teamId: "team-a", requesterId: "x", assigneeId: "y" },      // team-a member case
  { teamId: "team-z", requesterId: "x", assigneeId: "y" },      // foreign team
];

describe("INV-2: canReadTicket ⇔ ticketReadFilter", () => {
  it("agree across every scope × relationship combination", () => {
    for (const keys of SCOPES) {
      const c = ctx(keys, ["team-a"], "u1");
      const where = ticketReadFilter(c);
      for (const t of TICKETS) {
        expect(matches(where, t, c.userId)).toBe(canReadTicket(c, t));
      }
    }
  });
});

describe("scope semantics (acceptance #4, #5, #6)", () => {
  const foreign: TicketAccessShape = { teamId: "team-z", requesterId: "x", assigneeId: "y" };
  const ownTeam: TicketAccessShape = { teamId: "team-a", requesterId: "x", assigneeId: "y" };
  const mine: TicketAccessShape = { teamId: "team-z", requesterId: "u1", assigneeId: null };

  it("#4 requester (own) sees only their own tickets", () => {
    const c = ctx(["ticket.read.own"], [], "u1");
    expect(canReadTicket(c, mine)).toBe(true);
    expect(canReadTicket(c, foreign)).toBe(false);
    expect(canReadTicket(c, ownTeam)).toBe(false);
  });

  it("#5 agent (team) sees team tickets, not foreign teams", () => {
    const c = ctx(["ticket.read.team"], ["team-a"], "u1");
    expect(canReadTicket(c, ownTeam)).toBe(true);
    expect(canReadTicket(c, foreign)).toBe(false);
    // own carve-out still applies
    expect(canReadTicket(c, mine)).toBe(true);
  });

  it("#6 admin (all) sees everything in the tenant", () => {
    const c = ctx(["ticket.read.all"], [], "u1");
    expect(canReadTicket(c, foreign)).toBe(true);
    expect(canReadTicket(c, ownTeam)).toBe(true);
  });
});
