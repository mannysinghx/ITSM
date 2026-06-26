import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/authz";
import { createTicket, changeStatus, addComment } from "@/lib/tickets/service";
import { checkSlaBreaches } from "@/lib/sla/worker";

const uniq = () => `${randomUUID()}@test.local`;

beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({
    name: "O", email: uniq(), companyName: "SlaCo", password: "password123",
  });
  const teams = await withTenant(tenantId, userId, (tx) =>
    tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }),
  );
  const ctx: AuthContext = { userId, tenantId, teamIds: teams.map((t) => t.teamId), permissionKeys: new Set(PERMISSION_KEYS) };
  return { tenantId, ctx };
}

const auditCount = (tenantId: string, userId: string, action: string) =>
  withTenant(tenantId, userId, (tx) => tx.auditLog.count({ where: { action } }));

describe("SLA due dates on creation (acceptance #10)", () => {
  it("stamps due dates and inserts two timer rows", async () => {
    const { tenantId, ctx } = await freshTenant();
    const ticket = await createTicket(ctx, {
      title: "Outage", description: "x", type: "incident", impact: "critical", urgency: "critical",
    });
    expect(ticket.priority).toBe("p1");

    const row = await withTenant(tenantId, ctx.userId, async (tx) => ({
      ticket: await tx.ticket.findUnique({ where: { id: ticket.id }, select: { firstResponseDueAt: true, resolutionDueAt: true } }),
      timers: await tx.sLATimer.findMany({ where: { ticketId: ticket.id } }),
    }));
    expect(row.ticket?.firstResponseDueAt).not.toBeNull();
    expect(row.ticket?.resolutionDueAt).not.toBeNull();
    expect(row.timers).toHaveLength(2);
    expect(row.timers.map((t) => t.kind).sort()).toEqual(["first_response", "resolution"]);
  });
});

describe("SLA worker idempotency (phase invariant)", () => {
  it("warns once, then a re-run is a no-op", async () => {
    const { tenantId, ctx } = await freshTenant();
    await createTicket(ctx, { title: "Warn", description: "x", type: "incident", impact: "critical", urgency: "critical" });

    // now between first_response warnAt (12m) and dueAt (15m)
    const warnNow = new Date(Date.now() + 13 * 60_000);
    const first = await checkSlaBreaches(tenantId, warnNow);
    expect(first.warnings).toBe(1);
    expect(first.breaches).toBe(0);
    expect(await auditCount(tenantId, ctx.userId, "sla.warning")).toBe(1);

    const second = await checkSlaBreaches(tenantId, warnNow);
    expect(second.warnings).toBe(0);
    expect(await auditCount(tenantId, ctx.userId, "sla.warning")).toBe(1); // unchanged
  });

  it("breaches once and escalates, then a re-run is a no-op", async () => {
    const { tenantId, ctx } = await freshTenant();
    await createTicket(ctx, { title: "Breach", description: "x", type: "incident", impact: "critical", urgency: "critical" });

    // now past first_response dueAt (15m) but before resolution dueAt (240m)
    const breachNow = new Date(Date.now() + 16 * 60_000);
    const first = await checkSlaBreaches(tenantId, breachNow);
    expect(first.breaches).toBe(1);
    expect(first.escalations).toBe(1);
    expect(await auditCount(tenantId, ctx.userId, "sla.breached")).toBe(1);
    expect(await auditCount(tenantId, ctx.userId, "sla.escalated")).toBe(1);

    const second = await checkSlaBreaches(tenantId, breachNow);
    expect(second.breaches).toBe(0);
    expect(await auditCount(tenantId, ctx.userId, "sla.breached")).toBe(1); // unchanged
  });
});

describe("satisfied timers are skipped", () => {
  it("resolving a ticket stops its resolution timer", async () => {
    const { tenantId, ctx } = await freshTenant();
    const ticket = await createTicket(ctx, { title: "Resolve", description: "x", type: "incident", impact: "high", urgency: "high" });
    await changeStatus(ctx, ticket.id, "resolved");

    const resTimer = await withTenant(tenantId, ctx.userId, (tx) =>
      tx.sLATimer.findFirst({ where: { ticketId: ticket.id, kind: "resolution" } }),
    );
    expect(resTimer?.satisfiedAt).not.toBeNull();

    // Even far in the future, a resolved ticket's timers do not breach.
    const farFuture = new Date(Date.now() + 10_000 * 60_000);
    const result = await checkSlaBreaches(tenantId, farFuture);
    expect(result.breaches).toBe(0);
  });

  it("a public agent reply satisfies the first-response timer", async () => {
    const { tenantId, ctx } = await freshTenant();
    // requester user (own scope) creates the ticket
    const reqUser = await prisma.user.create({ data: { name: "R", email: uniq(), passwordHash: "x" } });
    const reqCtx: AuthContext = { userId: reqUser.id, tenantId, teamIds: [], permissionKeys: new Set(["ticket.create", "ticket.read.own", "ticket.comment.public"]) };
    const ticket = await createTicket(reqCtx, { title: "Help", description: "x", type: "incident", impact: "high", urgency: "high" });

    // owner (agent) posts a public reply
    await addComment(ctx, ticket.id, "On it.", false);

    const frTimer = await withTenant(tenantId, ctx.userId, (tx) =>
      tx.sLATimer.findFirst({ where: { ticketId: ticket.id, kind: "first_response" } }),
    );
    expect(frTimer?.satisfiedAt).not.toBeNull();
  });
});
