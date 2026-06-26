import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";
import type { PlanTier } from "@prisma/client";

export type LimitKind = "users" | "teams" | "tickets" | "integrations";

export interface PlanLimits {
  users: number;
  teams: number;
  tickets: number;
  integrations: number;
  aiTokens: number;
}

// -1 = unlimited (master spec §18.14).
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { users: 5, teams: 3, tickets: 100, integrations: 1, aiTokens: 100_000 },
  team: { users: 25, teams: 10, tickets: 5_000, integrations: 5, aiTokens: 1_000_000 },
  company: { users: 200, teams: 50, tickets: 100_000, integrations: 25, aiTokens: 10_000_000 },
  enterprise: { users: -1, teams: -1, tickets: -1, integrations: -1, aiTokens: -1 },
};

/** Lazily ensures a billing account exists (plan=free). Safe inside any withTenant tx. */
export async function ensureBilling(tx: Tx, tenantId: string) {
  const existing = await tx.billingAccount.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return tx.billingAccount.create({
    data: { tenantId, plan: "free", limits: PLAN_LIMITS.free as object },
  });
}

function limitsOf(account: { plan: PlanTier; limits: unknown }): PlanLimits {
  const stored = account.limits as Partial<PlanLimits> | null;
  return { ...PLAN_LIMITS[account.plan], ...(stored ?? {}) };
}

async function currentCount(tx: Tx, kind: LimitKind): Promise<number> {
  switch (kind) {
    case "users": return tx.tenantMembership.count();
    case "teams": return tx.team.count();
    case "tickets": return tx.ticket.count();
    case "integrations": return tx.integration.count();
  }
}

/**
 * Enforces the tenant's plan limit for a resource on its create path (master spec §18.14).
 * Throws ValidationError when at/over the limit; -1 means unlimited. Runs inside the
 * caller's withTenant tx so the count is consistent with the create.
 */
export async function enforceLimit(tx: Tx, tenantId: string, kind: LimitKind): Promise<void> {
  const account = await ensureBilling(tx, tenantId);
  const limit = limitsOf(account)[kind];
  if (limit < 0) return; // unlimited
  const count = await currentCount(tx, kind);
  if (count >= limit) {
    throw new ValidationError(`Plan limit reached for ${kind} (${limit}). Upgrade your plan.`);
  }
}

/** Appends a usage event (append-only metering). */
export async function recordUsage(tx: Tx, tenantId: string, kind: string, quantity = 1, metadata: Record<string, unknown> = {}) {
  await tx.usageEvent.create({ data: { tenantId, kind, quantity, metadata: metadata as object } });
}

export async function getBilling(ctx: AuthContext) {
  requirePermission(ctx, "billing.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const account = await ensureBilling(tx, ctx.tenantId);
    const limits = limitsOf(account);
    const [users, teams, tickets, integrations] = await Promise.all([
      tx.tenantMembership.count(), tx.team.count(), tx.ticket.count(), tx.integration.count(),
    ]);
    return { plan: account.plan, status: account.status, limits, usage: { users, teams, tickets, integrations } };
  });
}

export async function setPlan(ctx: AuthContext, plan: PlanTier) {
  requirePermission(ctx, "billing.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await ensureBilling(tx, ctx.tenantId);
    await tx.billingAccount.update({
      where: { tenantId: ctx.tenantId },
      data: { plan, limits: PLAN_LIMITS[plan] as object },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "billing.plan_changed", entityType: "billing_account", entityId: ctx.tenantId, metadata: { plan },
    });
    return { plan };
  });
}
