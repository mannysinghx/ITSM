import { randomBytes } from "crypto";
import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { enforceLimit } from "@/lib/billing/service";

/** Lists tenant members with their teams and assigned roles. */
export async function listUsers(ctx: AuthContext) {
  requirePermission(ctx, "user.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const memberships = await tx.tenantMembership.findMany({
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });
    const teamMemberships = await tx.teamMembership.findMany({
      select: { userId: true, team: { select: { id: true, name: true } } },
    });
    const assignments = await tx.userRoleAssignment.findMany({
      select: { userId: true, role: { select: { key: true, name: true } } },
    });
    return memberships.map((m) => ({
      ...m.user,
      membershipStatus: m.status,
      teams: teamMemberships.filter((t) => t.userId === m.user.id).map((t) => t.team),
      roles: assignments.filter((a) => a.userId === m.user.id).map((a) => a.role),
    }));
  });
}

export interface InviteInput {
  name: string;
  email: string;
  roleId?: string;
  teamId?: string;
}

/**
 * Invites a user: reuses an existing global user (cross-tenant) or creates one with
 * status=invited and an unusable random password. Membership + optional role/team +
 * audit all commit in one transaction (ADR-8).
 */
export async function inviteUser(ctx: AuthContext, input: InviteInput) {
  requirePermission(ctx, "user.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await enforceLimit(tx, ctx.tenantId, "users");
    let user = await tx.user.findUnique({ where: { email: input.email } });
    if (!user) {
      const placeholder = await hashPassword(randomBytes(24).toString("hex"));
      user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash: placeholder, status: "invited" },
      });
    }

    const existing = await tx.tenantMembership.findFirst({
      where: { tenantId: ctx.tenantId, userId: user.id },
      select: { id: true },
    });
    if (existing) throw new ConflictError("User is already a member of this tenant");

    await tx.tenantMembership.create({
      data: { tenantId: ctx.tenantId, userId: user.id, status: "invited" },
    });
    if (input.roleId) {
      await tx.userRoleAssignment.create({
        data: { tenantId: ctx.tenantId, userId: user.id, roleId: input.roleId, teamId: input.teamId ?? null },
      });
    }
    if (input.teamId) {
      await tx.teamMembership.create({
        data: { tenantId: ctx.tenantId, teamId: input.teamId, userId: user.id, roleId: input.roleId ?? null },
      });
    }

    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "user.invited", entityType: "user", entityId: user.id,
      metadata: { email: input.email, roleId: input.roleId ?? null, teamId: input.teamId ?? null },
    });
    return { id: user.id };
  });
}

/** Suspends or reactivates a user's membership in this tenant (tenant-scoped). */
export async function setUserStatus(
  ctx: AuthContext,
  userId: string,
  status: "active" | "suspended",
) {
  requirePermission(ctx, "user.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const membership = await tx.tenantMembership.findFirst({
      where: { tenantId: ctx.tenantId, userId },
    });
    if (!membership) throw new NotFoundError("User not in tenant");
    await tx.tenantMembership.update({ where: { id: membership.id }, data: { status } });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: status === "suspended" ? "user.suspended" : "user.reactivated",
      entityType: "user", entityId: userId,
    });
    return { id: userId, status };
  });
}

export async function assignRole(ctx: AuthContext, userId: string, roleId: string, teamId?: string) {
  requirePermission(ctx, "user.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const role = await tx.role.findFirst({
      where: { id: roleId, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
      select: { id: true },
    });
    if (!role) throw new NotFoundError("Role not found");
    await tx.userRoleAssignment.create({
      data: { tenantId: ctx.tenantId, userId, roleId, teamId: teamId ?? null },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "user.role_assigned", entityType: "user", entityId: userId,
      metadata: { roleId, teamId: teamId ?? null },
    });
    return { ok: true };
  });
}

export async function assignTeam(ctx: AuthContext, userId: string, teamId: string, roleId?: string) {
  requirePermission(ctx, "user.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) throw new NotFoundError("Team not found");
    await tx.teamMembership.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: { roleId: roleId ?? null },
      create: { tenantId: ctx.tenantId, teamId, userId, roleId: roleId ?? null },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId, teamId,
      action: "user.team_assigned", entityType: "user", entityId: userId,
      metadata: { teamId, roleId: roleId ?? null },
    });
    return { ok: true };
  });
}
