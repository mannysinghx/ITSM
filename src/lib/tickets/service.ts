import type { Severity, TicketSource, Priority, Prisma } from "@prisma/client";
import { withTenant, type Tx } from "@/lib/db";
import {
  type AuthContext,
  ForbiddenError,
  requirePermission,
  hasPermission,
  canAccessTeam,
} from "@/lib/authz";
import { canReadTicket, canWriteTicket, ticketReadFilter } from "@/lib/tickets/access";
import { allocateTicketNumber } from "@/lib/tickets/number";
import { resolvePriority } from "@/lib/tickets/priority";
import { recordHistory } from "@/lib/tickets/history";
import { applySla, satisfyFirstResponse, satisfyResolution } from "@/lib/sla/timers";
import { safeEmit } from "@/lib/automation/engine";
import {
  DEFAULT_TYPE_KEY,
  RESOLVED_STATUS_KEY,
  CLOSED_STATUS_KEY,
  REOPENED_STATUS_KEY,
} from "@/lib/tickets/config";

export class NotFoundError extends Error {
  constructor(msg = "Not found") {
    super(msg);
    this.name = "NotFoundError";
  }
}

/** True if the context may view internal notes (INV-4: requesters cannot). */
function canViewInternal(ctx: AuthContext): boolean {
  return hasPermission(ctx, "ticket.comment.internal") || hasPermission(ctx, "audit.read");
}

export interface CreateTicketInput {
  title: string;
  description: string;
  type?: string;
  teamId?: string;
  categoryId?: string;
  impact?: Severity;
  urgency?: Severity;
  source?: TicketSource;
  channel?: string;
  tags?: string[];
  /** Catalog flows set the priority directly instead of deriving from impact/urgency. */
  priorityOverride?: Priority;
}

/** opts.allowAnyTeam bypasses the team membership check for trusted server-side routing
 *  (catalog submissions route to a team the requester may not belong to). */
export async function createTicket(
  ctx: AuthContext,
  input: CreateTicketInput,
  opts: { allowAnyTeam?: boolean } = {},
) {
  requirePermission(ctx, "ticket.create");
  const ticket = await withTenant(ctx.tenantId, ctx.userId, (tx) => createTicketTx(tx, ctx, input, opts));
  await safeEmit(ctx.tenantId, { event: "ticket.created", entityType: "ticket", entityId: ticket.id, actorId: ctx.userId });
  return ticket;
}

/**
 * Ticket-creation core that runs inside a caller-provided transaction, so flows that
 * must be atomic with the ticket (catalog submission + form_submission + approvals)
 * can share one tx (Prisma can't nest transactions). Assumes ticket.create is already
 * authorized by the caller.
 */
export async function createTicketTx(
  tx: Tx,
  ctx: AuthContext,
  input: CreateTicketInput,
  opts: { allowAnyTeam?: boolean } = {},
) {
  {
    // Resolve target team: explicit (must be accessible unless trusted) or the tenant default.
    let teamId = input.teamId;
    if (teamId) {
      if (!opts.allowAnyTeam && !canAccessTeam(ctx, teamId)) {
        throw new ForbiddenError("Cannot post to that team");
      }
    } else {
      const def =
        (await tx.team.findFirst({ where: { isDefault: true }, select: { id: true } })) ??
        (await tx.team.findFirst({ select: { id: true } }));
      if (!def) throw new NotFoundError("No team available");
      teamId = def.id;
    }

    const typeKey = input.type ?? DEFAULT_TYPE_KEY;
    const type = await tx.ticketType.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: typeKey } },
      select: { id: true },
    });
    if (!type) throw new NotFoundError("Unknown ticket type");

    const status = await tx.ticketStatus.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });
    if (!status) throw new NotFoundError("No default status configured");

    let categoryId: string | null = null;
    if (input.categoryId) {
      const cat = await tx.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      });
      categoryId = cat?.id ?? null;
    }

    const impact = input.impact ?? "medium";
    const urgency = input.urgency ?? "medium";
    const priority = input.priorityOverride ?? (await resolvePriority(tx, ctx.tenantId, impact, urgency));
    const ticketNumber = await allocateTicketNumber(tx, ctx.tenantId);

    const ticket = await tx.ticket.create({
      data: {
        tenantId: ctx.tenantId,
        ticketNumber,
        teamId,
        requesterId: ctx.userId,
        title: input.title,
        description: input.description,
        typeId: type.id,
        statusId: status.id,
        categoryId,
        impact,
        urgency,
        priority,
        source: input.source ?? "portal",
        channel: input.channel ?? null,
        tags: input.tags ?? [],
        createdById: ctx.userId,
      },
    });

    await recordHistory(tx, {
      tenantId: ctx.tenantId,
      ticketId: ticket.id,
      teamId,
      actorId: ctx.userId,
      action: "created",
      newValue: ticketNumber,
      metadata: { title: input.title, priority },
    });

    // Stamp SLA due dates + insert timers in the same tx (ADR-6, acceptance #10).
    await applySla(tx, ctx.tenantId, {
      ticketId: ticket.id, ticketType: typeKey, priority, teamId,
    });

    return ticket;
  }
}

/** Config the create/edit form needs: types, categories, postable teams, priority matrix. */
export async function getTicketMeta(ctx: AuthContext) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const [types, categories, statuses, allTeams, matrix] = await Promise.all([
      tx.ticketType.findMany({ select: { key: true, name: true }, orderBy: { name: "asc" } }),
      tx.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.ticketStatus.findMany({
        select: { key: true, name: true, category: true, order: true },
        orderBy: { order: "asc" },
      }),
      tx.team.findMany({ select: { id: true, name: true, isDefault: true } }),
      tx.priorityMatrixEntry.findMany({ select: { impact: true, urgency: true, priority: true } }),
    ]);
    // Teams the user may post to: their own, or all if they have cross-team admin.
    const teams = allTeams.filter((t) => canAccessTeam(ctx, t.id));
    return {
      types,
      categories,
      statuses,
      teams: teams.length ? teams : allTeams.filter((t) => t.isDefault),
      matrix,
    };
  });
}

export interface ListFilters {
  statusKey?: string;
  typeKey?: string;
  priority?: string;
  assigneeId?: string;
  teamId?: string;
  q?: string;
}

export async function listTickets(ctx: AuthContext, filters: ListFilters) {
  if (!hasPermission(ctx, "ticket.read.own") &&
      !hasPermission(ctx, "ticket.read.team") &&
      !hasPermission(ctx, "ticket.read.all")) {
    throw new ForbiddenError("No ticket read permission");
  }

  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const and: Prisma.TicketWhereInput[] = [ticketReadFilter(ctx)];
    if (filters.teamId) and.push({ teamId: filters.teamId });
    if (filters.assigneeId) and.push({ assigneeId: filters.assigneeId });
    if (filters.priority) and.push({ priority: filters.priority as Prisma.EnumPriorityFilter });
    if (filters.statusKey) and.push({ status: { key: filters.statusKey } });
    if (filters.typeKey) and.push({ type: { key: filters.typeKey } });
    if (filters.q) {
      and.push({
        OR: [
          { title: { contains: filters.q, mode: "insensitive" } },
          { ticketNumber: { contains: filters.q, mode: "insensitive" } },
        ],
      });
    }

    return tx.ticket.findMany({
      where: { AND: and },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        priority: true,
        impact: true,
        urgency: true,
        teamId: true,
        createdAt: true,
        status: { select: { key: true, name: true, category: true } },
        type: { select: { key: true, name: true } },
        team: { select: { name: true } },
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
      },
      take: 200,
    });
  });
}

export async function getTicket(ctx: AuthContext, id: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id },
      include: {
        status: true,
        type: true,
        category: true,
        team: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        comments: { orderBy: { createdAt: "asc" } },
        history: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");
    if (!canReadTicket(ctx, ticket)) throw new ForbiddenError();

    // INV-4: strip internal notes for anyone without internal-view permission.
    if (!canViewInternal(ctx)) {
      ticket.comments = ticket.comments.filter((c) => !c.isInternal);
    }
    return { ticket, canWrite: canWriteTicket(ctx, ticket), canViewInternal: canViewInternal(ctx) };
  });
}

/** Loads a ticket and enforces the write gate; returns the row for mutation. */
async function loadWritable(tx: Prisma.TransactionClient, ctx: AuthContext, id: string) {
  const ticket = await tx.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError("Ticket not found");
  if (!canWriteTicket(ctx, ticket)) throw new ForbiddenError();
  return ticket;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  categoryId?: string | null;
  impact?: Severity;
  urgency?: Severity;
  tags?: string[];
}

export async function updateTicket(ctx: AuthContext, id: string, patch: UpdateTicketInput) {
  const updated = await withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await loadWritable(tx, ctx, id);

    const data: Prisma.TicketUpdateInput = { updatedById: ctx.userId };
    const changes: { field: string; oldValue: string; newValue: string }[] = [];

    if (patch.title !== undefined && patch.title !== ticket.title) {
      data.title = patch.title;
      changes.push({ field: "title", oldValue: ticket.title, newValue: patch.title });
    }
    if (patch.description !== undefined && patch.description !== ticket.description) {
      data.description = patch.description;
      changes.push({ field: "description", oldValue: "(updated)", newValue: "(updated)" });
    }
    if (patch.categoryId !== undefined) {
      data.category = patch.categoryId
        ? { connect: { id: patch.categoryId } }
        : { disconnect: true };
      changes.push({ field: "category", oldValue: ticket.categoryId ?? "", newValue: patch.categoryId ?? "" });
    }
    // Impact/urgency change re-derives priority (ADR-5).
    const impact = patch.impact ?? ticket.impact;
    const urgency = patch.urgency ?? ticket.urgency;
    if (patch.impact !== undefined || patch.urgency !== undefined) {
      const priority = await resolvePriority(tx, ctx.tenantId, impact, urgency);
      data.impact = impact;
      data.urgency = urgency;
      if (priority !== ticket.priority) {
        data.priority = priority;
        changes.push({ field: "priority", oldValue: ticket.priority, newValue: priority });
      }
    }
    if (patch.tags !== undefined) data.tags = patch.tags;

    const updated = await tx.ticket.update({ where: { id }, data });

    for (const c of changes) {
      await recordHistory(tx, {
        tenantId: ctx.tenantId,
        ticketId: id,
        teamId: ticket.teamId,
        actorId: ctx.userId,
        action: "updated",
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
      });
    }
    return updated;
  });
  await safeEmit(ctx.tenantId, { event: "ticket.updated", entityType: "ticket", entityId: id, actorId: ctx.userId });
  return updated;
}

export async function assignTicket(ctx: AuthContext, id: string, assigneeId: string | null) {
  requirePermission(ctx, "ticket.assign");
  const updated = await withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await loadWritable(tx, ctx, id);
    const updated = await tx.ticket.update({
      where: { id },
      data: { assigneeId, updatedById: ctx.userId },
    });
    await recordHistory(tx, {
      tenantId: ctx.tenantId,
      ticketId: id,
      teamId: ticket.teamId,
      actorId: ctx.userId,
      action: "assigned",
      field: "assignee",
      oldValue: ticket.assigneeId ?? "",
      newValue: assigneeId ?? "",
    });
    return updated;
  });
  await safeEmit(ctx.tenantId, { event: "ticket.assigned", entityType: "ticket", entityId: id, actorId: ctx.userId });
  return updated;
}

/** Generic status transition by status key; sets resolved/closed/reopened timestamps. */
export async function changeStatus(ctx: AuthContext, id: string, toKey: string) {
  const updated = await withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await loadWritable(tx, ctx, id);
    const target = await tx.ticketStatus.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: toKey } },
      select: { id: true, key: true, name: true },
    });
    if (!target) throw new NotFoundError("Unknown status");

    const from = await tx.ticketStatus.findUnique({
      where: { id: ticket.statusId },
      select: { key: true, name: true },
    });

    const data: Prisma.TicketUpdateInput = {
      status: { connect: { id: target.id } },
      updatedById: ctx.userId,
    };
    if (toKey === RESOLVED_STATUS_KEY) data.resolvedAt = new Date();
    if (toKey === CLOSED_STATUS_KEY) data.closedAt = new Date();
    if (toKey === REOPENED_STATUS_KEY) {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const updated = await tx.ticket.update({ where: { id }, data });

    // Resolving/closing satisfies the resolution SLA timer (stops the clock).
    if (toKey === RESOLVED_STATUS_KEY || toKey === CLOSED_STATUS_KEY) {
      await satisfyResolution(tx, id);
    }
    await recordHistory(tx, {
      tenantId: ctx.tenantId,
      ticketId: id,
      teamId: ticket.teamId,
      actorId: ctx.userId,
      action: "status_changed",
      field: "status",
      oldValue: from?.key ?? "",
      newValue: target.key,
      metadata: { from: from?.name, to: target.name },
    });
    return updated;
  });
  await safeEmit(ctx.tenantId, { event: "ticket.status_changed", entityType: "ticket", entityId: id, actorId: ctx.userId });
  return updated;
}

export async function listHistory(ctx: AuthContext, id: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id },
      select: { teamId: true, requesterId: true, assigneeId: true },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");
    if (!canReadTicket(ctx, ticket)) throw new ForbiddenError();
    return tx.ticketHistory.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
    });
  });
}

export interface AttachmentMeta {
  filename: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
}

export async function addAttachment(ctx: AuthContext, id: string, meta: AttachmentMeta) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundError("Ticket not found");
    if (!canReadTicket(ctx, ticket)) throw new ForbiddenError();

    const att = await tx.ticketAttachment.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: id,
        uploaderId: ctx.userId,
        filename: meta.filename,
        contentType: meta.contentType,
        byteSize: meta.byteSize,
        storageKey: meta.storageKey,
      },
    });
    await recordHistory(tx, {
      tenantId: ctx.tenantId,
      ticketId: id,
      teamId: ticket.teamId,
      actorId: ctx.userId,
      action: "attachment_added",
      metadata: { filename: meta.filename },
    });
    return att;
  });
}

export async function addComment(
  ctx: AuthContext,
  id: string,
  body: string,
  isInternal: boolean,
) {
  requirePermission(ctx, isInternal ? "ticket.comment.internal" : "ticket.comment.public");
  const comment = await withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundError("Ticket not found");
    // Must at least be able to read the ticket to comment on it.
    if (!canReadTicket(ctx, ticket)) throw new ForbiddenError();

    const comment = await tx.ticketComment.create({
      data: { tenantId: ctx.tenantId, ticketId: id, authorId: ctx.userId, body, isInternal },
    });
    await recordHistory(tx, {
      tenantId: ctx.tenantId,
      ticketId: id,
      teamId: ticket.teamId,
      actorId: ctx.userId,
      action: "commented",
      metadata: { internal: isInternal },
    });

    // A public reply from anyone other than the requester satisfies first-response SLA.
    if (!isInternal && ticket.requesterId !== ctx.userId) {
      await satisfyFirstResponse(tx, id);
    }
    return comment;
  });
  await safeEmit(ctx.tenantId, { event: "comment.created", entityType: "ticket", entityId: id, actorId: ctx.userId });
  return comment;
}
