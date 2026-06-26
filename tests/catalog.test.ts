import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { ForbiddenError, type AuthContext } from "@/lib/authz";
import { createForm, createCatalogItem } from "@/lib/admin/catalog";
import { submitCatalog } from "@/lib/catalog/service";
import { decideApproval, listApprovalInbox } from "@/lib/catalog/approvals";

const uniq = () => `${randomUUID()}@test.local`;

beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({
    name: "O", email: uniq(), companyName: "CatCo", password: "password123",
  });
  const teams = await withTenant(tenantId, userId, (tx) =>
    tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }),
  );
  const adminCtx: AuthContext = { userId, tenantId, teamIds: teams.map((t) => t.teamId), permissionKeys: new Set(PERMISSION_KEYS) };
  return { tenantId, adminCtx, teamId: teams[0].teamId };
}

async function makeUser(tenantId: string, perms: string[] = []): Promise<AuthContext> {
  const u = await prisma.user.create({ data: { name: "U", email: uniq(), passwordHash: "x" } });
  return { userId: u.id, tenantId, teamIds: [], permissionKeys: new Set(perms) };
}

const auditCount = (tenantId: string, action: string, entityId: string) =>
  withTenant(tenantId, undefined, (tx) => tx.auditLog.count({ where: { action, entityId } }));

describe("catalog submission creates a ticket", () => {
  it("applies the item defaults and routes to its team", async () => {
    const { tenantId, adminCtx, teamId } = await freshTenant();
    const form = await createForm(adminCtx, "F", { fields: [{ key: "note", label: "Note", type: "text", required: true }] });
    const item = await createCatalogItem(adminCtx, {
      name: "Reset Password", teamId, formDefinitionId: form.id, defaultPriority: "p2", visibility: "internal",
    });

    const requester = await makeUser(tenantId, ["ticket.create"]);
    const result = await submitCatalog(requester, item.id, { note: "please reset" });

    expect(result.ticketNumber).toMatch(/^TKT-\d{5}$/);
    const ticket = await withTenant(tenantId, adminCtx.userId, (tx) =>
      tx.ticket.findUnique({ where: { id: result.ticketId }, select: { teamId: true, priority: true, source: true } }),
    );
    expect(ticket?.teamId).toBe(teamId);
    expect(ticket?.priority).toBe("p2");
    expect(ticket?.source).toBe("portal");

    const sub = await withTenant(tenantId, adminCtx.userId, (tx) =>
      tx.formSubmission.findFirst({ where: { catalogItemId: item.id }, select: { ticketId: true } }),
    );
    expect(sub?.ticketId).toBe(result.ticketId);
  });

  it("rejects values that fail form validation", async () => {
    const { tenantId, adminCtx, teamId } = await freshTenant();
    const form = await createForm(adminCtx, "F", { fields: [{ key: "email", label: "Email", type: "email", required: true }] });
    const item = await createCatalogItem(adminCtx, { name: "X", teamId, formDefinitionId: form.id, visibility: "internal" });
    const requester = await makeUser(tenantId, ["ticket.create"]);
    await expect(submitCatalog(requester, item.id, { email: "not-an-email" })).rejects.toThrow();
  });
});

describe("approval chains", () => {
  it("advances strictly by sequence; only the active approver decides; every decision is audited", async () => {
    const { tenantId, adminCtx, teamId } = await freshTenant();
    const approverA = await makeUser(tenantId);
    const approverB = await makeUser(tenantId);
    const outsider = await makeUser(tenantId);

    const form = await createForm(adminCtx, "F", { fields: [{ key: "j", label: "Justify", type: "text", required: true }] });
    const item = await createCatalogItem(adminCtx, {
      name: "New Laptop", teamId, formDefinitionId: form.id, approvalRequired: true,
      approvalChain: [{ type: "user", userId: approverA.userId }, { type: "user", userId: approverB.userId }],
      visibility: "internal",
    });

    const requester = await makeUser(tenantId, ["ticket.create"]);
    const result = await submitCatalog(requester, item.id, { j: "need it" });

    // Ticket is waiting_on_approval; two pending approvals.
    const state = await withTenant(tenantId, adminCtx.userId, async (tx) => ({
      status: (await tx.ticket.findUnique({ where: { id: result.ticketId }, include: { status: true } }))?.status.key,
      approvals: await tx.approval.findMany({ where: { ticketId: result.ticketId }, orderBy: { sequence: "asc" } }),
    }));
    expect(state.status).toBe("waiting_on_approval");
    expect(state.approvals).toHaveLength(2);

    const seq0 = state.approvals[0].id;
    const seq1 = state.approvals[1].id;

    // Outsider cannot decide.
    await expect(decideApproval(outsider, seq0, "approved")).rejects.toThrow(ForbiddenError);
    // Cannot decide step 1 before step 0.
    await expect(decideApproval(approverB, seq1, "approved")).rejects.toThrow(/earlier/i);

    // A's inbox shows the active step.
    const inboxA = await listApprovalInbox(approverA);
    expect(inboxA.some((a) => a.id === seq0)).toBe(true);

    // A approves step 0 → still waiting, step 1 now active.
    await decideApproval(approverA, seq0, "approved");
    expect(await auditCount(tenantId, "approval.approved", result.ticketId)).toBe(1);
    const mid = await withTenant(tenantId, adminCtx.userId, (tx) =>
      tx.ticket.findUnique({ where: { id: result.ticketId }, include: { status: true } }),
    );
    expect(mid?.status.key).toBe("waiting_on_approval");

    // B approves step 1 → chain complete, ticket leaves waiting_on_approval.
    await decideApproval(approverB, seq1, "approved");
    expect(await auditCount(tenantId, "approval.approved", result.ticketId)).toBe(2);
    const done = await withTenant(tenantId, adminCtx.userId, (tx) =>
      tx.ticket.findUnique({ where: { id: result.ticketId }, include: { status: true } }),
    );
    expect(done?.status.key).toBe("triaged");
  });

  it("rejection halts the chain and cancels the ticket", async () => {
    const { tenantId, adminCtx, teamId } = await freshTenant();
    const approverA = await makeUser(tenantId);
    const approverB = await makeUser(tenantId);
    const form = await createForm(adminCtx, "F", { fields: [{ key: "j", label: "J", type: "text", required: true }] });
    const item = await createCatalogItem(adminCtx, {
      name: "Laptop", teamId, formDefinitionId: form.id, approvalRequired: true,
      approvalChain: [{ type: "user", userId: approverA.userId }, { type: "user", userId: approverB.userId }],
      visibility: "internal",
    });
    const requester = await makeUser(tenantId, ["ticket.create"]);
    const result = await submitCatalog(requester, item.id, { j: "x" });

    const seq0 = await withTenant(tenantId, adminCtx.userId, (tx) =>
      tx.approval.findFirst({ where: { ticketId: result.ticketId, sequence: 0 }, select: { id: true } }),
    );
    await decideApproval(approverA, seq0!.id, "rejected", "not approved");

    const after = await withTenant(tenantId, adminCtx.userId, async (tx) => ({
      ticket: await tx.ticket.findUnique({ where: { id: result.ticketId }, include: { status: true } }),
      approvals: await tx.approval.findMany({ where: { ticketId: result.ticketId }, orderBy: { sequence: "asc" } }),
    }));
    expect(after.ticket?.status.key).toBe("cancelled");
    expect(after.approvals[0].status).toBe("rejected");
    expect(after.approvals[1].status).toBe("skipped");
    expect(await auditCount(tenantId, "approval.rejected", result.ticketId)).toBe(1);
  });
});
