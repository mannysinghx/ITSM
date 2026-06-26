import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/authz";
import { evaluateConditions } from "@/lib/automation/conditions";
import { createRule } from "@/lib/admin/automation";
import { createTicket, updateTicket } from "@/lib/tickets/service";
import { processDeferredSteps } from "@/lib/integrations/channels";

const uniq = () => `${randomUUID()}@test.local`;
beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({ name: "O", email: uniq(), companyName: "AutoCo", password: "password123" });
  const teams = await withTenant(tenantId, userId, (tx) => tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }));
  const ctx: AuthContext = { userId, tenantId, teamIds: teams.map((t) => t.teamId), permissionKeys: new Set(PERMISSION_KEYS) };
  return { tenantId, ctx };
}

describe("condition evaluator", () => {
  it("ANDs conditions and supports dotted paths", () => {
    const snap = { priority: "p1", status: { key: "new" }, source: "portal" };
    expect(evaluateConditions(snap, [{ field: "priority", operator: "equals", value: "p1" }])).toBe(true);
    expect(evaluateConditions(snap, [{ field: "status.key", operator: "equals", value: "new" }])).toBe(true);
    expect(evaluateConditions(snap, [
      { field: "priority", operator: "equals", value: "p1" },
      { field: "source", operator: "equals", value: "email" },
    ])).toBe(false);
    expect(evaluateConditions(snap, [])).toBe(true); // empty = match
  });
});

describe("trigger → synchronous action", () => {
  it("a ticket.created rule sets priority and records a completed run", async () => {
    const { tenantId, ctx } = await freshTenant();
    await createRule(ctx, {
      name: "Escalate phishing", event: "ticket.created",
      conditions: [{ field: "type", operator: "equals", value: "security_event" }],
      actions: [{ type: "set_priority", value: "p1" }],
    });

    const ticket = await createTicket(ctx, { title: "Phish", description: "x", type: "security_event", impact: "low", urgency: "low" });

    const after = await withTenant(tenantId, ctx.userId, async (tx) => ({
      ticket: await tx.ticket.findUnique({ where: { id: ticket.id }, select: { priority: true } }),
      run: await tx.workflowRun.findFirst({ where: { entityId: ticket.id, status: "completed" }, include: { steps: true } }),
    }));
    expect(after.ticket?.priority).toBe("p1"); // overridden from low/low (p4) by the rule
    expect(after.run?.steps[0].actionType).toBe("set_priority");
    expect(after.run?.steps[0].status).toBe("ok");
  });

  it("does not fire when conditions do not match", async () => {
    const { tenantId, ctx } = await freshTenant();
    await createRule(ctx, {
      name: "only incidents", event: "ticket.created",
      conditions: [{ field: "type", operator: "equals", value: "incident" }],
      actions: [{ type: "add_tag", value: "auto" }],
    });
    const ticket = await createTicket(ctx, { title: "Q", description: "x", type: "question" });
    const t = await withTenant(tenantId, ctx.userId, (tx) => tx.ticket.findUnique({ where: { id: ticket.id }, select: { tags: true } }));
    expect(t?.tags).not.toContain("auto");
  });
});

describe("loop protection (phase invariant)", () => {
  it("a self-triggering rule on ticket.updated terminates", async () => {
    const { tenantId, ctx } = await freshTenant();
    await createRule(ctx, {
      name: "tag on update", event: "ticket.updated",
      conditions: [], actions: [{ type: "add_tag", value: "touched" }],
    });
    const ticket = await createTicket(ctx, { title: "Loop", description: "x", type: "incident" });

    // This update emits ticket.updated → rule adds a tag → emits ticket.updated again
    // → dedupe-skipped. Must return (not hang) and add the tag exactly once.
    await updateTicket(ctx, ticket.id, { title: "Loop edited" });

    const after = await withTenant(tenantId, ctx.userId, async (tx) => ({
      tags: (await tx.ticket.findUnique({ where: { id: ticket.id }, select: { tags: true } }))?.tags,
      skipped: await tx.workflowRun.count({ where: { entityId: ticket.id, status: "skipped" } }),
    }));
    expect(after.tags?.filter((t) => t === "touched")).toHaveLength(1);
    expect(after.skipped).toBeGreaterThanOrEqual(1); // the re-trigger was dedupe-skipped
  });
});

describe("sync-vs-worker split (ADR-9)", () => {
  it("a webhook action is deferred, not run inline, then delivered by the worker", async () => {
    const { tenantId, ctx } = await freshTenant();
    await createRule(ctx, {
      name: "notify webhook", event: "ticket.created",
      conditions: [], actions: [{ type: "call_webhook", url: "https://example.test/hook" }],
    });
    const ticket = await createTicket(ctx, { title: "Hook", description: "x", type: "incident" });

    const before = await withTenant(tenantId, ctx.userId, (tx) =>
      tx.workflowRunStep.findFirst({ where: { actionType: "call_webhook" } }),
    );
    expect(before?.status).toBe("deferred"); // never executed inline

    const result = await processDeferredSteps(tenantId);
    expect(result.delivered).toBeGreaterThanOrEqual(1);
    const after = await withTenant(tenantId, ctx.userId, (tx) =>
      tx.workflowRunStep.findFirst({ where: { id: before!.id } }),
    );
    expect(after?.status).toBe("ok");
    void ticket;
  });
});
