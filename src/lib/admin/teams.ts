import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { slugify } from "@/lib/validation";

export async function listTeams(ctx: AuthContext) {
  requirePermission(ctx, "team.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const teams = await tx.team.findMany({ orderBy: { createdAt: "asc" } });
    const members = await tx.teamMembership.findMany({
      select: { teamId: true, userId: true, user: { select: { name: true } } },
    });
    return teams.map((t) => ({
      ...t,
      memberCount: members.filter((m) => m.teamId === t.id).length,
      members: members.filter((m) => m.teamId === t.id).map((m) => ({ userId: m.userId, name: m.user.name })),
    }));
  });
}

export async function createTeam(ctx: AuthContext, name: string, description?: string) {
  requirePermission(ctx, "team.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const team = await tx.team.create({
      data: { tenantId: ctx.tenantId, name, slug: slugify(name), description: description ?? null },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId, teamId: team.id,
      action: "team.created", entityType: "team", entityId: team.id, metadata: { name },
    });
    return { id: team.id };
  });
}

export interface TeamPatch {
  name?: string;
  description?: string | null;
  status?: string; // "active" | "archived"
}

export async function updateTeam(ctx: AuthContext, teamId: string, patch: TeamPatch) {
  requirePermission(ctx, "team.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundError("Team not found");
    const updated = await tx.team.update({
      where: { id: teamId },
      data: {
        name: patch.name ?? undefined,
        description: patch.description === undefined ? undefined : patch.description,
        status: patch.status ?? undefined,
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId, teamId,
      action: patch.status === "archived" ? "team.archived" : "team.updated",
      entityType: "team", entityId: teamId, metadata: { ...patch },
    });
    return { id: updated.id };
  });
}

export async function addTeamMember(ctx: AuthContext, teamId: string, userId: string, roleId?: string) {
  requirePermission(ctx, "team.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.teamMembership.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: { roleId: roleId ?? null },
      create: { tenantId: ctx.tenantId, teamId, userId, roleId: roleId ?? null },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId, teamId,
      action: "team.member_added", entityType: "team", entityId: teamId, metadata: { userId, roleId: roleId ?? null },
    });
    return { ok: true };
  });
}

export async function removeTeamMember(ctx: AuthContext, teamId: string, userId: string) {
  requirePermission(ctx, "team.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.teamMembership.deleteMany({ where: { teamId, userId } });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId, teamId,
      action: "team.member_removed", entityType: "team", entityId: teamId, metadata: { userId },
    });
    return { ok: true };
  });
}
