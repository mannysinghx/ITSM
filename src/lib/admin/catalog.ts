import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";

// --- Form definitions ---

export async function listForms(ctx: AuthContext) {
  requirePermission(ctx, "catalog.create");
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.formDefinition.findMany({ orderBy: { name: "asc" } }),
  );
}

export async function createForm(ctx: AuthContext, name: string, schema: unknown) {
  requirePermission(ctx, "catalog.create");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const form = await tx.formDefinition.create({
      data: { tenantId: ctx.tenantId, name, schema: (schema ?? { fields: [] }) as object },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "form.created", entityType: "form_definition", entityId: form.id, metadata: { name },
    });
    return { id: form.id };
  });
}

export async function updateForm(ctx: AuthContext, id: string, patch: { name?: string; schema?: unknown }) {
  requirePermission(ctx, "catalog.update");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const existing = await tx.formDefinition.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundError("Form not found");
    await tx.formDefinition.update({
      where: { id },
      data: {
        name: patch.name ?? undefined,
        schema: patch.schema === undefined ? undefined : (patch.schema as object),
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "form.updated", entityType: "form_definition", entityId: id, metadata: {},
    });
    return { id };
  });
}

// --- Catalog items ---

export async function listCatalogItems(ctx: AuthContext) {
  requirePermission(ctx, "catalog.create");
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.serviceCatalogItem.findMany({ orderBy: { name: "asc" } }),
  );
}

export interface CatalogItemInput {
  name: string;
  description?: string;
  category?: string;
  teamId?: string | null;
  formDefinitionId?: string | null;
  defaultPriority?: "p1" | "p2" | "p3" | "p4";
  defaultSlaPolicyId?: string | null;
  approvalRequired?: boolean;
  approvalChain?: unknown;
  routingRule?: unknown;
  visibility?: "public" | "internal" | "team";
  status?: string;
}

export async function createCatalogItem(ctx: AuthContext, input: CatalogItemInput) {
  requirePermission(ctx, "catalog.create");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const item = await tx.serviceCatalogItem.create({
      data: {
        tenantId: ctx.tenantId, name: input.name, description: input.description ?? null,
        category: input.category ?? null, teamId: input.teamId ?? null,
        formDefinitionId: input.formDefinitionId ?? null,
        defaultPriority: input.defaultPriority ?? "p3",
        defaultSlaPolicyId: input.defaultSlaPolicyId ?? null,
        approvalRequired: input.approvalRequired ?? false,
        approvalChain: (input.approvalChain ?? []) as object,
        routingRule: (input.routingRule ?? {}) as object,
        visibility: input.visibility ?? "internal",
        status: input.status ?? "active",
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "catalog.item_created", entityType: "service_catalog_item", entityId: item.id, metadata: { name: input.name },
    });
    return { id: item.id };
  });
}

export async function updateCatalogItem(ctx: AuthContext, id: string, patch: Partial<CatalogItemInput>) {
  requirePermission(ctx, "catalog.update");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const existing = await tx.serviceCatalogItem.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundError("Catalog item not found");
    await tx.serviceCatalogItem.update({
      where: { id },
      data: {
        name: patch.name ?? undefined,
        description: patch.description === undefined ? undefined : patch.description,
        category: patch.category === undefined ? undefined : patch.category,
        teamId: patch.teamId === undefined ? undefined : patch.teamId,
        formDefinitionId: patch.formDefinitionId === undefined ? undefined : patch.formDefinitionId,
        defaultPriority: patch.defaultPriority ?? undefined,
        defaultSlaPolicyId: patch.defaultSlaPolicyId === undefined ? undefined : patch.defaultSlaPolicyId,
        approvalRequired: patch.approvalRequired ?? undefined,
        approvalChain: patch.approvalChain === undefined ? undefined : (patch.approvalChain as object),
        routingRule: patch.routingRule === undefined ? undefined : (patch.routingRule as object),
        visibility: patch.visibility ?? undefined,
        status: patch.status ?? undefined,
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "catalog.item_updated", entityType: "service_catalog_item", entityId: id, metadata: {},
    });
    return { id };
  });
}
