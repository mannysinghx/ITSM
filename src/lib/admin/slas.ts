import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission, requireAnyPermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import type { Priority } from "@prisma/client";

export async function listSlaPolicies(ctx: AuthContext) {
  requireAnyPermission(ctx, ["sla.create", "sla.update"]);
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.sLAPolicy.findMany({ orderBy: { createdAt: "asc" } }),
  );
}

export interface SlaPolicyInput {
  name: string;
  description?: string;
  teamId?: string | null;
  ticketType?: string | null;
  priority?: Priority | null;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  enabled?: boolean;
}

export async function createSlaPolicy(ctx: AuthContext, input: SlaPolicyInput) {
  requirePermission(ctx, "sla.create");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const policy = await tx.sLAPolicy.create({
      data: {
        tenantId: ctx.tenantId, name: input.name, description: input.description ?? null,
        teamId: input.teamId ?? null, ticketType: input.ticketType ?? null,
        priority: input.priority ?? null,
        firstResponseMinutes: input.firstResponseMinutes, resolutionMinutes: input.resolutionMinutes,
        enabled: input.enabled ?? true,
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "sla.policy_created", entityType: "sla_policy", entityId: policy.id, metadata: { name: input.name },
    });
    return { id: policy.id };
  });
}

export async function updateSlaPolicy(ctx: AuthContext, id: string, patch: Partial<SlaPolicyInput>) {
  requirePermission(ctx, "sla.update");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const existing = await tx.sLAPolicy.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundError("SLA policy not found");
    await tx.sLAPolicy.update({
      where: { id },
      data: {
        name: patch.name ?? undefined,
        description: patch.description === undefined ? undefined : patch.description,
        teamId: patch.teamId === undefined ? undefined : patch.teamId,
        ticketType: patch.ticketType === undefined ? undefined : patch.ticketType,
        priority: patch.priority === undefined ? undefined : patch.priority,
        firstResponseMinutes: patch.firstResponseMinutes ?? undefined,
        resolutionMinutes: patch.resolutionMinutes ?? undefined,
        enabled: patch.enabled ?? undefined,
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "sla.policy_updated", entityType: "sla_policy", entityId: id, metadata: { ...patch },
    });
    return { id };
  });
}
