import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";

export interface AuditFilters {
  actorId?: string;
  entityType?: string;
  action?: string;
}

/** Read-only audit viewer (ADR-8: app role has no UPDATE/DELETE on audit_logs). */
export async function listAuditLogs(ctx: AuthContext, filters: AuditFilters = {}) {
  requirePermission(ctx, "audit.read");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const logs = await tx.auditLog.findMany({
      where: {
        actorId: filters.actorId || undefined,
        entityType: filters.entityType || undefined,
        action: filters.action ? { contains: filters.action } : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter((a): a is string => !!a)));
    const actors = actorIds.length
      ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(actors.map((a) => [a.id, a.name]));

    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      actorId: l.actorId,
      actorName: l.actorId ? nameById.get(l.actorId) ?? "—" : "system",
      metadata: l.metadata,
      createdAt: l.createdAt,
    }));
  });
}

/** Read-only admin dashboard data: tenant overview + counts + recent activity. */
export async function getAdminOverview(ctx: AuthContext) {
  requirePermission(ctx, "admin.view");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const [tenant, userCount, teamCount, ticketCount, recent] = await Promise.all([
      tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, type: true, plan: true } }),
      tx.tenantMembership.count(),
      tx.team.count(),
      tx.ticket.count(),
      tx.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    return { tenant, userCount, teamCount, ticketCount, recent };
  });
}
