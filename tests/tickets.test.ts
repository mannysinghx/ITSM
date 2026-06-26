import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/authz";
import {
  createTicket,
  addComment,
  getTicket,
  listTickets,
  changeStatus,
} from "@/lib/tickets/service";

const uniq = () => `${randomUUID()}@test.local`;

beforeAll(async () => {
  await ensureSystemRolesAndPermissions();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** Provisions a fresh company and returns ids + an owner (all-permissions) context. */
async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({
    name: "Owner", email: uniq(), companyName: "T", password: "password123",
  });
  const teams = await withTenant(tenantId, userId, (tx) =>
    tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }),
  );
  const ownerCtx: AuthContext = {
    userId, tenantId,
    teamIds: teams.map((t) => t.teamId),
    permissionKeys: new Set(PERMISSION_KEYS),
  };
  const defaultTeamId = await withTenant(tenantId, userId, (tx) =>
    tx.team.findFirst({ where: { isDefault: true }, select: { id: true } }),
  ).then((t) => t!.id);
  return { tenantId, ownerCtx, defaultTeamId };
}

async function makeUser(): Promise<string> {
  const u = await prisma.user.create({
    data: { name: "U", email: uniq(), passwordHash: "x" },
  });
  return u.id;
}

describe("ticket creation (acceptance #7, INV-5)", () => {
  it("writes ticket_history + audit_logs in one transaction", async () => {
    const { tenantId, ownerCtx } = await freshTenant();
    const ticket = await createTicket(ownerCtx, {
      title: "Test", description: "Body", type: "incident",
      impact: "high", urgency: "high",
    });
    expect(ticket.ticketNumber).toMatch(/^TKT-\d{5}$/);
    expect(ticket.priority).toBe("p2"); // high × high = P2

    const counts = await withTenant(tenantId, ownerCtx.userId, async (tx) => ({
      created: await tx.ticketHistory.count({ where: { ticketId: ticket.id, action: "created" } }),
      audit: await tx.auditLog.count({ where: { entityId: ticket.id, action: "ticket.created" } }),
    }));
    expect(counts.created).toBe(1);
    expect(counts.audit).toBe(1);
  });
});

describe("status change (acceptance #8, INV-5)", () => {
  it("resolve writes history + audit and sets resolvedAt", async () => {
    const { tenantId, ownerCtx } = await freshTenant();
    const ticket = await createTicket(ownerCtx, {
      title: "Resolve me", description: "x", type: "incident",
    });
    await changeStatus(ownerCtx, ticket.id, "resolved");

    const after = await withTenant(tenantId, ownerCtx.userId, async (tx) => ({
      ticket: await tx.ticket.findUnique({ where: { id: ticket.id }, include: { status: true } }),
      statusHist: await tx.ticketHistory.count({ where: { ticketId: ticket.id, action: "status_changed" } }),
      audit: await tx.auditLog.count({ where: { entityId: ticket.id, action: "ticket.status_changed" } }),
    }));
    expect(after.ticket?.status.key).toBe("resolved");
    expect(after.ticket?.resolvedAt).not.toBeNull();
    expect(after.statusHist).toBe(1);
    expect(after.audit).toBe(1);
  });
});

describe("internal notes (acceptance #9, INV-4)", () => {
  it("are hidden from a requester but visible to an agent", async () => {
    const { tenantId, ownerCtx, defaultTeamId } = await freshTenant();

    // A requester user with own-scope, not on any team.
    const requesterId = await makeUser();
    const requesterCtx: AuthContext = {
      userId: requesterId, tenantId, teamIds: [],
      permissionKeys: new Set(["ticket.create", "ticket.read.own", "ticket.comment.public"]),
    };

    const ticket = await createTicket(requesterCtx, {
      title: "My issue", description: "help", teamId: undefined, type: "incident",
    });
    expect(ticket.teamId).toBe(defaultTeamId);

    // Agent (owner) adds an internal note + a public reply.
    await addComment(ownerCtx, ticket.id, "INTERNAL: investigating", true);
    await addComment(ownerCtx, ticket.id, "We are on it.", false);

    const asRequester = await getTicket(requesterCtx, ticket.id);
    expect(asRequester.canViewInternal).toBe(false);
    expect(asRequester.ticket.comments.some((c) => c.isInternal)).toBe(false);
    expect(asRequester.ticket.comments.some((c) => c.body === "We are on it.")).toBe(true);

    const asAgent = await getTicket(ownerCtx, ticket.id);
    expect(asAgent.canViewInternal).toBe(true);
    expect(asAgent.ticket.comments.some((c) => c.isInternal)).toBe(true);
  });
});

describe("team isolation in the queue (acceptance #3)", () => {
  it("a team-scoped agent does not see another team's tickets", async () => {
    const { tenantId, ownerCtx, defaultTeamId } = await freshTenant();

    // Second team.
    const otherTeamId = await withTenant(tenantId, ownerCtx.userId, (tx) =>
      tx.team.create({ data: { tenantId, name: "Security", slug: `sec-${randomUUID().slice(0, 6)}` } }),
    ).then((t) => t.id);

    const inDefault = await createTicket(ownerCtx, {
      title: "Default team ticket", description: "x", teamId: defaultTeamId, type: "incident",
    });
    const inOther = await createTicket(ownerCtx, {
      title: "Other team ticket", description: "x", teamId: otherTeamId, type: "incident",
    });

    // Agent scoped to the default team only.
    const agentId = await makeUser();
    const agentCtx: AuthContext = {
      userId: agentId, tenantId, teamIds: [defaultTeamId],
      permissionKeys: new Set(["ticket.read.team"]),
    };

    const visible = await listTickets(agentCtx, {});
    const ids = visible.map((t) => t.id);
    expect(ids).toContain(inDefault.id);
    expect(ids).not.toContain(inOther.id);
  });
});
