import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission, ForbiddenError } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";
import { createTicketTx } from "@/lib/tickets/service";
import { buildZod, asFormSchema, valuesToDescription } from "@/lib/catalog/form";
import { materializeApprovals, type ChainStep } from "@/lib/catalog/approvals";
import type { Prisma } from "@prisma/client";

/** Visibility filter for the portal: public/internal to all members; team-only to team members. */
function visibleWhere(ctx: AuthContext): Prisma.ServiceCatalogItemWhereInput {
  return {
    status: "active",
    OR: [
      { visibility: { in: ["public", "internal"] } },
      { visibility: "team", teamId: { in: ctx.teamIds } },
    ],
  };
}

export async function listCatalog(ctx: AuthContext) {
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.serviceCatalogItem.findMany({
      where: visibleWhere(ctx),
      select: { id: true, name: true, description: true, category: true, approvalRequired: true },
      orderBy: { name: "asc" },
    }),
  );
}

export async function getCatalogItem(ctx: AuthContext, id: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const item = await tx.serviceCatalogItem.findFirst({
      where: { id, ...visibleWhere(ctx) },
      include: { formDefinition: true },
    });
    if (!item) throw new NotFoundError("Catalog item not found");
    return {
      id: item.id, name: item.name, description: item.description, category: item.category,
      approvalRequired: item.approvalRequired,
      formSchema: item.formDefinition ? asFormSchema(item.formDefinition.schema) : { fields: [] },
    };
  });
}

/** Resolves the target team: explicit item team, a team-picker field value, or the default. */
async function resolveTeam(
  tx: Prisma.TransactionClient,
  item: { teamId: string | null; routingRule: unknown },
  values: Record<string, unknown>,
): Promise<string> {
  if (item.teamId) return item.teamId;
  const rule = (item.routingRule ?? {}) as { fieldKey?: string };
  if (rule.fieldKey && typeof values[rule.fieldKey] === "string") {
    return values[rule.fieldKey] as string;
  }
  const def = (await tx.team.findFirst({ where: { isDefault: true }, select: { id: true } })) ??
    (await tx.team.findFirst({ select: { id: true } }));
  if (!def) throw new NotFoundError("No team available");
  return def.id;
}

/**
 * Validates the submitted form values, then in ONE transaction: records the submission,
 * creates a ticket (source=portal, item defaults, routed team, SLA stamped), and — if
 * the item requires approval — materializes the approval chain and marks the ticket
 * waiting_on_approval (ADR-6).
 */
export async function submitCatalog(ctx: AuthContext, itemId: string, values: Record<string, unknown>) {
  requirePermission(ctx, "ticket.create");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const item = await tx.serviceCatalogItem.findFirst({
      where: { id: itemId, ...visibleWhere(ctx) },
      include: { formDefinition: true },
    });
    if (!item) throw new ForbiddenError("Catalog item not available");

    const schema = item.formDefinition ? asFormSchema(item.formDefinition.schema) : { fields: [] };
    const validated = buildZod(schema).parse(values) as Record<string, unknown>;

    const teamId = await resolveTeam(tx, item, validated);

    const ticket = await createTicketTx(
      tx, ctx,
      {
        title: item.name,
        description: valuesToDescription(schema, validated),
        type: "service_request",
        teamId,
        source: "portal",
        priorityOverride: item.defaultPriority,
      },
      { allowAnyTeam: true },
    );

    await tx.formSubmission.create({
      data: {
        tenantId: ctx.tenantId, catalogItemId: item.id,
        formDefinitionId: item.formDefinitionId, submittedById: ctx.userId,
        values: validated as object, ticketId: ticket.id,
      },
    });

    let approvalCount = 0;
    if (item.approvalRequired) {
      const chain = (item.approvalChain ?? []) as ChainStep[];
      approvalCount = await materializeApprovals(tx, ctx.tenantId, ctx.userId, ticket.id, teamId, chain);
      if (approvalCount > 0) {
        const waiting = await tx.ticketStatus.findUnique({
          where: { tenantId_key: { tenantId: ctx.tenantId, key: "waiting_on_approval" } },
          select: { id: true },
        });
        if (waiting) await tx.ticket.update({ where: { id: ticket.id }, data: { statusId: waiting.id } });
      }
    }

    return { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, approvals: approvalCount };
  });
}
