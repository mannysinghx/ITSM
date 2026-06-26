import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";

const PERM = "automation.manage";

export interface RuleInput {
  name: string;
  event: string;
  conditions?: unknown;
  actions?: unknown;
  enabled?: boolean;
  priority?: number;
  teamId?: string | null;
}

export async function listRules(ctx: AuthContext) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.automationRule.findMany({ orderBy: [{ event: "asc" }, { priority: "asc" }] }),
  );
}

export async function createRule(ctx: AuthContext, input: RuleInput) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const rule = await tx.automationRule.create({
      data: {
        tenantId: ctx.tenantId, name: input.name, event: input.event,
        conditions: (input.conditions ?? []) as object, actions: (input.actions ?? []) as object,
        enabled: input.enabled ?? true, priority: input.priority ?? 0,
        teamId: input.teamId ?? null, createdByUserId: ctx.userId,
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "automation.rule_created", entityType: "automation_rule", entityId: rule.id, metadata: { name: input.name, event: input.event },
    });
    return { id: rule.id };
  });
}

export async function updateRule(ctx: AuthContext, id: string, patch: Partial<RuleInput>) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const rule = await tx.automationRule.findUnique({ where: { id }, select: { id: true } });
    if (!rule) throw new NotFoundError("Rule not found");
    await tx.automationRule.update({
      where: { id },
      data: {
        name: patch.name ?? undefined, event: patch.event ?? undefined,
        conditions: patch.conditions === undefined ? undefined : (patch.conditions as object),
        actions: patch.actions === undefined ? undefined : (patch.actions as object),
        enabled: patch.enabled ?? undefined, priority: patch.priority ?? undefined,
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "automation.rule_updated", entityType: "automation_rule", entityId: id, metadata: {},
    });
    return { id };
  });
}

export async function deleteRule(ctx: AuthContext, id: string) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.automationRule.deleteMany({ where: { id } });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "automation.rule_deleted", entityType: "automation_rule", entityId: id, metadata: {},
    });
    return { ok: true };
  });
}

export async function listRuns(ctx: AuthContext, entityId?: string) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.workflowRun.findMany({
      where: entityId ? { entityId } : {},
      include: { steps: { orderBy: { stepIndex: "asc" } } },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
  );
}
