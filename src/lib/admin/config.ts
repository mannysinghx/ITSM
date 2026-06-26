import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { slugify } from "@/lib/validation";

const PERM = "ticket.config.manage";

export async function getTicketConfig(ctx: AuthContext) {
  requirePermission(ctx, PERM);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const [types, statuses, matrix, categories, fieldDefs] = await Promise.all([
      tx.ticketType.findMany({ orderBy: { name: "asc" } }),
      tx.ticketStatus.findMany({ orderBy: { order: "asc" } }),
      tx.priorityMatrixEntry.findMany(),
      tx.category.findMany({ orderBy: { name: "asc" } }),
      tx.ticketFieldDef.findMany({ orderBy: { order: "asc" } }),
    ]);
    return { types, statuses, matrix, categories, fieldDefs };
  });
}

export interface ConfigMutation {
  resource: "type" | "status" | "matrix" | "category" | "field";
  op: "create" | "update" | "delete";
  id?: string;
  data?: Record<string, unknown>;
}

async function audit(tx: Tx, ctx: AuthContext, m: ConfigMutation, entityId: string) {
  await writeAudit(tx, {
    tenantId: ctx.tenantId, actorId: ctx.userId,
    action: `ticket_config.${m.resource}.${m.op}`,
    entityType: `ticket_config.${m.resource}`, entityId,
    metadata: { ...(m.data ?? {}) },
  });
}

/** Single dispatch for all ticket-config edits. isSystem rows cannot be deleted (ADR-5). */
export async function mutateTicketConfig(ctx: AuthContext, m: ConfigMutation) {
  requirePermission(ctx, PERM);
  const d = m.data ?? {};
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const tenantId = ctx.tenantId;

    switch (m.resource) {
      case "type": {
        if (m.op === "create") {
          const row = await tx.ticketType.create({
            data: { tenantId, key: slugify(String(d.name)), name: String(d.name), isSystem: false },
          });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        if (m.op === "update") {
          const row = await tx.ticketType.update({ where: { id: m.id! }, data: { name: d.name as string } });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        return deleteGuarded(tx, ctx, m, () => tx.ticketType.findUnique({ where: { id: m.id! } }), () => tx.ticketType.delete({ where: { id: m.id! } }));
      }

      case "status": {
        if (m.op === "create") {
          const row = await tx.ticketStatus.create({
            data: {
              tenantId, key: slugify(String(d.name)), name: String(d.name),
              category: (d.category as "open" | "pending" | "resolved" | "closed" | "cancelled") ?? "open",
              order: Number(d.order ?? 0), isSystem: false,
            },
          });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        if (m.op === "update") {
          const row = await tx.ticketStatus.update({
            where: { id: m.id! },
            data: {
              name: d.name as string | undefined,
              category: d.category as "open" | "pending" | "resolved" | "closed" | "cancelled" | undefined,
              order: d.order === undefined ? undefined : Number(d.order),
            },
          });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        return deleteGuarded(tx, ctx, m, () => tx.ticketStatus.findUnique({ where: { id: m.id! } }), () => tx.ticketStatus.delete({ where: { id: m.id! } }));
      }

      case "matrix": {
        if (m.op !== "update") throw new ValidationError("matrix supports update only");
        const impact = d.impact as "low" | "medium" | "high" | "critical";
        const urgency = d.urgency as "low" | "medium" | "high" | "critical";
        const priority = d.priority as "p1" | "p2" | "p3" | "p4";
        const row = await tx.priorityMatrixEntry.upsert({
          where: { tenantId_impact_urgency: { tenantId, impact, urgency } },
          update: { priority },
          create: { tenantId, impact, urgency, priority },
        });
        await audit(tx, ctx, m, row.id);
        return { id: row.id };
      }

      case "category": {
        if (m.op === "create") {
          const row = await tx.category.create({
            data: { tenantId, name: String(d.name), parentId: (d.parentId as string) ?? null, isSystem: false },
          });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        if (m.op === "update") {
          const row = await tx.category.update({ where: { id: m.id! }, data: { name: d.name as string } });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        return deleteGuarded(tx, ctx, m, () => tx.category.findUnique({ where: { id: m.id! } }), () => tx.category.delete({ where: { id: m.id! } }));
      }

      case "field": {
        if (m.op === "create") {
          const row = await tx.ticketFieldDef.create({
            data: {
              tenantId, key: slugify(String(d.label)), label: String(d.label),
              fieldType: (d.fieldType as "text" | "number" | "select" | "date" | "bool") ?? "text",
              options: (d.options ?? []) as object, required: Boolean(d.required), order: Number(d.order ?? 0),
            },
          });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        if (m.op === "update") {
          const row = await tx.ticketFieldDef.update({
            where: { id: m.id! },
            data: {
              label: d.label as string | undefined,
              required: d.required === undefined ? undefined : Boolean(d.required),
              order: d.order === undefined ? undefined : Number(d.order),
              options: d.options === undefined ? undefined : (d.options as object),
            },
          });
          await audit(tx, ctx, m, row.id);
          return { id: row.id };
        }
        const row = await tx.ticketFieldDef.delete({ where: { id: m.id! } });
        await audit(tx, ctx, m, row.id);
        return { id: row.id };
      }
    }
  });
}

/** Deletes a config row only if it is not a system row (ADR-5). */
async function deleteGuarded(
  tx: Tx,
  ctx: AuthContext,
  m: ConfigMutation,
  find: () => Promise<{ id: string; isSystem: boolean } | null>,
  del: () => Promise<{ id: string }>,
) {
  const row = await find();
  if (!row) throw new NotFoundError("Config item not found");
  if (row.isSystem) throw new ValidationError("System items cannot be deleted");
  const deleted = await del();
  await audit(tx, ctx, m, deleted.id);
  return { id: deleted.id };
}
