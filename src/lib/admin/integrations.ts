import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import type { IntegrationKind } from "@prisma/client";

const PERM = "integration.manage";

export async function listIntegrations(ctx: AuthContext) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.integration.findMany({ orderBy: { createdAt: "asc" } }),
  );
}

export async function createIntegration(
  ctx: AuthContext, input: { kind: IntegrationKind; name: string; config?: unknown },
) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const row = await tx.integration.create({
      data: { tenantId: ctx.tenantId, kind: input.kind, name: input.name, config: (input.config ?? {}) as object },
    });
    // Register the global mailbox → tenant route so inbound email can resolve the tenant
    // pre-context (mailbox_routes is NOT RLS). Owner from the tenant.
    const mailbox = (input.config as { mailbox?: string } | undefined)?.mailbox;
    if (input.kind === "email" && mailbox) {
      const tenant = await tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { ownerUserId: true } });
      await tx.mailboxRoute.upsert({
        where: { mailbox: mailbox.toLowerCase() },
        update: { tenantId: ctx.tenantId, ownerUserId: tenant!.ownerUserId },
        create: { mailbox: mailbox.toLowerCase(), tenantId: ctx.tenantId, ownerUserId: tenant!.ownerUserId },
      });
    }
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "integration.created", entityType: "integration", entityId: row.id, metadata: { kind: input.kind, name: input.name },
    });
    return { id: row.id };
  });
}

export async function deleteIntegration(ctx: AuthContext, id: string) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.integration.deleteMany({ where: { id } });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "integration.deleted", entityType: "integration", entityId: id, metadata: {},
    });
    return { ok: true };
  });
}

export async function listWebhooks(ctx: AuthContext) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, (tx) => tx.webhook.findMany({ orderBy: { createdAt: "desc" } }));
}

export async function createWebhook(ctx: AuthContext, input: { url: string; events: string[] }) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const wh = await tx.webhook.create({
      data: { tenantId: ctx.tenantId, url: input.url, events: input.events },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "webhook.created", entityType: "webhook", entityId: wh.id, metadata: { url: input.url, events: input.events },
    });
    return { id: wh.id };
  });
}

export async function deleteWebhook(ctx: AuthContext, id: string) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const wh = await tx.webhook.findUnique({ where: { id }, select: { id: true } });
    if (!wh) throw new NotFoundError("Webhook not found");
    await tx.webhook.delete({ where: { id } });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "webhook.deleted", entityType: "webhook", entityId: id, metadata: {},
    });
    return { ok: true };
  });
}
