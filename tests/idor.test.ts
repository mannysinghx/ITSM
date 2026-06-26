import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/authz";
import { createTicket } from "@/lib/tickets/service";
import { createTask } from "@/lib/tasks/service";
import { createRule } from "@/lib/admin/automation";
import { createIntegration } from "@/lib/admin/integrations";
import { createArticle } from "@/lib/knowledge/service";
import { createApiKey, listApiKeys } from "@/lib/integrations/apikeys";

const uniq = () => `${randomUUID()}@test.local`;
beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({ name: "O", email: uniq(), companyName: "IdorCo", password: "password123" });
  const teams = await withTenant(tenantId, userId, (tx) => tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }));
  const ctx: AuthContext = { userId, tenantId, teamIds: teams.map((t) => t.teamId), permissionKeys: new Set(PERMISSION_KEYS) };
  return { tenantId, ctx, teamId: teams[0].teamId };
}

/**
 * The expanded cross-tenant IDOR matrix (acceptance #15), run as the app DB role. For
 * every tenant-owned resource, a valid id from tenant B must be invisible from tenant A:
 * RLS returns null/0 — not a 403 — even though the id is real and guessed.
 */
describe("cross-tenant IDOR matrix (acceptance #15, run as app role)", () => {
  it("blocks reads of every tenant-owned resource across tenants", async () => {
    const A = await freshTenant();
    const B = await freshTenant();

    // Create one of each resource in tenant B.
    const bTicket = await createTicket(B.ctx, { title: "B ticket", description: "x", type: "incident" });
    const bTask = await createTask(B.ctx, { title: "B task", teamId: B.teamId });
    const bRule = await createRule(B.ctx, { name: "B rule", event: "ticket.created", actions: [{ type: "add_tag", value: "x" }] });
    const bIntegration = await createIntegration(B.ctx, { kind: "slack", name: "B slack" });
    const bArticle = await createArticle(B.ctx, { title: "B article", body: "secret" });

    // From tenant A's context, each B id is invisible (RLS).
    const seen = await withTenant(A.tenantId, A.ctx.userId, async (tx) => ({
      ticket: await tx.ticket.findUnique({ where: { id: bTicket.id } }),
      task: await tx.task.findUnique({ where: { id: bTask.id } }),
      rule: await tx.automationRule.findUnique({ where: { id: bRule.id } }),
      integration: await tx.integration.findUnique({ where: { id: bIntegration.id } }),
      article: await tx.knowledgeArticle.findUnique({ where: { id: bArticle.id } }),
      // counts of B's rows visible from A
      ticketCount: await tx.ticket.count({ where: { tenantId: B.tenantId } }),
      taskCount: await tx.task.count({ where: { tenantId: B.tenantId } }),
      auditCount: await tx.auditLog.count({ where: { tenantId: B.tenantId } }),
    }));

    expect(seen.ticket).toBeNull();
    expect(seen.task).toBeNull();
    expect(seen.rule).toBeNull();
    expect(seen.integration).toBeNull();
    expect(seen.article).toBeNull();
    expect(seen.ticketCount).toBe(0);
    expect(seen.taskCount).toBe(0);
    expect(seen.auditCount).toBe(0);
  });

  it("API keys (a global table) are still tenant-scoped in the app layer", async () => {
    const A = await freshTenant();
    const B = await freshTenant();
    const bKey = await createApiKey(B.ctx, "B key", ["ticket.read"]);

    const aKeys = await listApiKeys(A.ctx);
    expect(aKeys.find((k) => k.id === bKey.id)).toBeUndefined();
  });
});
