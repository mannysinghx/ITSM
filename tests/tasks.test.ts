import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { ForbiddenError, type AuthContext } from "@/lib/authz";
import { createTicket } from "@/lib/tickets/service";
import { createTask, updateTask, listTasks, getTask } from "@/lib/tasks/service";

const uniq = () => `${randomUUID()}@test.local`;

beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({
    name: "O", email: uniq(), companyName: "TaskCo", password: "password123",
  });
  const teams = await withTenant(tenantId, userId, (tx) =>
    tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }),
  );
  const ctx: AuthContext = { userId, tenantId, teamIds: teams.map((t) => t.teamId), permissionKeys: new Set(PERMISSION_KEYS) };
  const defaultTeamId = teams[0].teamId;
  return { tenantId, ctx, defaultTeamId };
}

describe("task CRUD + history", () => {
  it("creates a standalone task and writes history on status change", async () => {
    const { tenantId, ctx, defaultTeamId } = await freshTenant();
    const task = await createTask(ctx, { title: "Configure VPN", teamId: defaultTeamId, priority: "p2" });
    expect(task.status).toBe("todo");

    await updateTask(ctx, task.id, { status: "in_progress" });

    const data = await withTenant(tenantId, ctx.userId, async (tx) => ({
      task: await tx.task.findUnique({ where: { id: task.id }, select: { status: true } }),
      statusHist: await tx.taskHistory.count({ where: { taskId: task.id, action: "status_changed" } }),
      audit: await tx.auditLog.count({ where: { entityId: task.id, action: "task.status_changed" } }),
    }));
    expect(data.task?.status).toBe("in_progress");
    expect(data.statusHist).toBe(1);
    expect(data.audit).toBe(1);
  });

  it("a ticket-linked task inherits the ticket's team", async () => {
    const { ctx } = await freshTenant();
    const ticket = await createTicket(ctx, { title: "T", description: "x", type: "incident" });
    const task = await createTask(ctx, { title: "Linked", ticketId: ticket.id });
    expect(task.ticketId).toBe(ticket.id);
    expect(task.teamId).toBe(ticket.teamId);
  });
});

describe("task access", () => {
  it("a non-member without task perms cannot read a team's tasks", async () => {
    const { tenantId, ctx, defaultTeamId } = await freshTenant();
    const task = await createTask(ctx, { title: "Secret task", teamId: defaultTeamId });

    const outsider: AuthContext = {
      userId: (await prisma.user.create({ data: { name: "X", email: uniq(), passwordHash: "x" } })).id,
      tenantId, teamIds: [], permissionKeys: new Set(["ticket.read.own"]),
    };
    // No task.read.team and not a member/assignee → list is empty, get is forbidden.
    expect(await listTasks(outsider, {})).toHaveLength(0);
    await expect(getTask(outsider, task.id)).rejects.toThrow(ForbiddenError);
  });
});
