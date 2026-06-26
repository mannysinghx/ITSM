import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export interface AiSettings {
  enabled: boolean;
  provider: string;
  routing: Record<string, string>;
  redaction: { enabled: boolean };
  budget: { tokenLimit: number; windowDays: number };
  perModule: Record<string, boolean>;
  externalAutoResponseAllowed: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  provider: "mock",
  routing: {},
  redaction: { enabled: true }, // redaction-by-default
  budget: { tokenLimit: 1_000_000, windowDays: 30 },
  perModule: { classify: true, priority: true, team: true, summarize: true, draft: true, knowledge: true },
  externalAutoResponseAllowed: false,
};

/** Reads tenant.settings.ai merged over defaults. */
export async function getAiSettings(tx: Tx, tenantId: string): Promise<AiSettings> {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const ai = ((tenant?.settings as { ai?: Partial<AiSettings> } | null)?.ai) ?? {};
  return {
    ...DEFAULT_AI_SETTINGS,
    ...ai,
    redaction: { ...DEFAULT_AI_SETTINGS.redaction, ...(ai.redaction ?? {}) },
    budget: { ...DEFAULT_AI_SETTINGS.budget, ...(ai.budget ?? {}) },
    perModule: { ...DEFAULT_AI_SETTINGS.perModule, ...(ai.perModule ?? {}) },
    routing: { ...DEFAULT_AI_SETTINGS.routing, ...(ai.routing ?? {}) },
  };
}

export async function readAiSettings(ctx: AuthContext): Promise<AiSettings> {
  requirePermission(ctx, "ai.config.manage");
  return withTenant(ctx.tenantId, ctx.userId, (tx) => getAiSettings(tx, ctx.tenantId));
}

export interface AiSettingsPatch {
  enabled?: boolean;
  provider?: string;
  routing?: Record<string, string>;
  redaction?: { enabled?: boolean };
  budget?: { tokenLimit?: number; windowDays?: number };
  perModule?: Record<string, boolean>;
  externalAutoResponseAllowed?: boolean;
}

/** Updates tenant.settings.ai and writes an audit row (ADR-8). */
export async function updateAiSettings(ctx: AuthContext, patch: AiSettingsPatch) {
  requirePermission(ctx, "ai.config.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { settings: true } });
    const current = (tenant?.settings as Record<string, unknown>) ?? {};
    const currentAi = await getAiSettings(tx, ctx.tenantId);
    const nextAi: AiSettings = {
      ...currentAi,
      ...patch,
      redaction: { ...currentAi.redaction, ...(patch.redaction ?? {}) },
      budget: { ...currentAi.budget, ...(patch.budget ?? {}) },
      perModule: { ...currentAi.perModule, ...(patch.perModule ?? {}) },
      routing: { ...currentAi.routing, ...(patch.routing ?? {}) },
    };
    await tx.tenant.update({
      where: { id: ctx.tenantId },
      data: { settings: { ...current, ai: nextAi } as object },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "ai.settings_updated", entityType: "tenant", entityId: ctx.tenantId,
      metadata: { changed: Object.keys(patch) },
    });
    return nextAi;
  });
}
