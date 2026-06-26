import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { ForbiddenError, type AuthContext } from "@/lib/authz";
import { listUsers, inviteUser } from "@/lib/admin/users";
import { createTeam } from "@/lib/admin/teams";
import { createRole } from "@/lib/admin/roles";
import { mutateTicketConfig } from "@/lib/admin/config";
import { listAuditLogs } from "@/lib/admin/audit";
import { getTicketMeta } from "@/lib/tickets/service";

const uniq = () => `${randomUUID()}@test.local`;

beforeAll(async () => {
  await ensureSystemRolesAndPermissions();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({
    name: "Admin", email: uniq(), companyName: "AdminCo", password: "password123",
  });
  const teams = await withTenant(tenantId, userId, (tx) =>
    tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }),
  );
  const adminCtx: AuthContext = {
    userId, tenantId, teamIds: teams.map((t) => t.teamId),
    permissionKeys: new Set(PERMISSION_KEYS),
  };
  const nonAdminCtx: AuthContext = {
    userId, tenantId, teamIds: [],
    permissionKeys: new Set(["ticket.read.team", "ticket.create"]),
  };
  return { tenantId, adminCtx, nonAdminCtx };
}

describe("admin permission gate (acceptance #11)", () => {
  it("non-admin is refused on every admin operation", async () => {
    const { nonAdminCtx } = await freshTenant();
    await expect(listUsers(nonAdminCtx)).rejects.toThrow(ForbiddenError);
    await expect(inviteUser(nonAdminCtx, { name: "X", email: uniq() })).rejects.toThrow(ForbiddenError);
    await expect(createTeam(nonAdminCtx, "X")).rejects.toThrow(ForbiddenError);
    await expect(createRole(nonAdminCtx, { name: "X", permissionKeys: ["ticket.create"] })).rejects.toThrow(ForbiddenError);
    await expect(
      mutateTicketConfig(nonAdminCtx, { resource: "type", op: "create", data: { name: "X" } }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("admin can manage users/teams/roles/config (acceptance #11)", () => {
  it("invites a user, creates a team and a role", async () => {
    const { adminCtx, tenantId } = await freshTenant();

    const invited = await inviteUser(adminCtx, { name: "New Hire", email: uniq() });
    expect(invited.id).toBeTruthy();

    const team = await createTeam(adminCtx, "Network Ops");
    expect(team.id).toBeTruthy();

    const role = await createRole(adminCtx, {
      name: "Read Only Plus",
      permissionKeys: ["ticket.read.all", "report.view"],
    });
    expect(role.id).toBeTruthy();

    const users = await listUsers(adminCtx);
    expect(users.some((u) => u.id === invited.id)).toBe(true);

    // The invited user is reflected as a tenant member.
    const memberCount = await withTenant(tenantId, adminCtx.userId, (tx) =>
      tx.tenantMembership.count(),
    );
    expect(memberCount).toBeGreaterThanOrEqual(2);
  });
});

describe("admin mutations are audited (acceptance #14)", () => {
  it("invite + team + role create write audit rows", async () => {
    const { adminCtx } = await freshTenant();
    await inviteUser(adminCtx, { name: "Audited", email: uniq() });
    await createTeam(adminCtx, "Audited Team");
    await createRole(adminCtx, { name: "Audited Role", permissionKeys: ["report.view"] });

    const logs = await listAuditLogs(adminCtx);
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("user.invited");
    expect(actions).toContain("team.created");
    expect(actions).toContain("role.created");
  });
});

describe("ticket-config edits flow through to ticket creation (acceptance #11)", () => {
  it("a new ticket type becomes selectable on the create form", async () => {
    const { adminCtx } = await freshTenant();
    await mutateTicketConfig(adminCtx, {
      resource: "type",
      op: "create",
      data: { name: "Hardware Replacement" },
    });
    const meta = await getTicketMeta(adminCtx);
    expect(meta.types.some((t) => t.name === "Hardware Replacement")).toBe(true);
  });

  it("system config rows cannot be deleted", async () => {
    const { adminCtx, tenantId } = await freshTenant();
    const sysType = await withTenant(tenantId, adminCtx.userId, (tx) =>
      tx.ticketType.findFirst({ where: { isSystem: true }, select: { id: true } }),
    );
    await expect(
      mutateTicketConfig(adminCtx, { resource: "type", op: "delete", id: sysType!.id }),
    ).rejects.toThrow(/System/);
  });
});
