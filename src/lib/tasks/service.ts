import type { Prisma, TaskStatus, Priority } from "@prisma/client";
import { withTenant, type Tx } from "@/lib/db";
import {
  type AuthContext,
  ForbiddenError,
  requirePermission,
  hasPermission,
  canAccessTeam,
} from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications/service";
import { NotFoundError } from "@/lib/errors";

interface TaskShape {
  teamId: string;
  assigneeId: string | null;
  createdById: string;
}

const MATCH_NONE: Prisma.TaskWhereInput = { id: "00000000-0000-0000-0000-000000000000" };

function isAdmin(ctx: AuthContext) {
  return hasPermission(ctx, "admin.configure");
}

export function canReadTask(ctx: AuthContext, t: TaskShape): boolean {
  if (isAdmin(ctx)) return true;
  if (!hasPermission(ctx, "task.read.team")) return false;
  return ctx.teamIds.includes(t.teamId) || t.assigneeId === ctx.userId || t.createdById === ctx.userId;
}

export function canWriteTask(ctx: AuthContext, t: TaskShape): boolean {
  if (isAdmin(ctx)) return true;
  if (hasPermission(ctx, "task.update.team") && ctx.teamIds.includes(t.teamId)) return true;
  return t.assigneeId === ctx.userId;
}

export function taskReadFilter(ctx: AuthContext): Prisma.TaskWhereInput {
  if (isAdmin(ctx)) return {};
  if (!hasPermission(ctx, "task.read.team")) return MATCH_NONE;
  return { OR: [{ teamId: { in: ctx.teamIds } }, { assigneeId: ctx.userId }, { createdById: ctx.userId }] };
}

async function recordTaskHistory(
  tx: Tx,
  ctx: AuthContext,
  taskId: string,
  action: string,
  field?: string,
  oldValue?: string | null,
  newValue?: string | null,
) {
  await tx.taskHistory.create({
    data: { tenantId: ctx.tenantId, taskId, actorId: ctx.userId, action, field: field ?? null, oldValue: oldValue ?? null, newValue: newValue ?? null },
  });
  await writeAudit(tx, {
    tenantId: ctx.tenantId, actorId: ctx.userId,
    action: `task.${action}`, entityType: "task", entityId: taskId,
    metadata: { field, oldValue, newValue },
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  teamId?: string;
  ticketId?: string;
  assigneeId?: string;
  priority?: Priority;
  dueAt?: string;
}

export async function createTask(ctx: AuthContext, input: CreateTaskInput) {
  requirePermission(ctx, "task.create");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    let teamId = input.teamId;
    // Ticket-linked task inherits the ticket's team.
    if (input.ticketId) {
      const ticket = await tx.ticket.findUnique({ where: { id: input.ticketId }, select: { teamId: true } });
      if (!ticket) throw new NotFoundError("Linked ticket not found");
      teamId = ticket.teamId;
    }
    if (!teamId) {
      const def = (await tx.team.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true }, select: { id: true } })) ??
        (await tx.team.findFirst({ where: { tenantId: ctx.tenantId }, select: { id: true } }));
      if (!def) throw new NotFoundError("No team available");
      teamId = def.id;
    }
    if (!canAccessTeam(ctx, teamId)) throw new ForbiddenError("Cannot create tasks in that team");

    const task = await tx.task.create({
      data: {
        tenantId: ctx.tenantId, teamId, ticketId: input.ticketId ?? null,
        title: input.title, description: input.description ?? null,
        priority: input.priority ?? "p3", assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null, createdById: ctx.userId,
      },
    });
    await recordTaskHistory(tx, ctx, task.id, "created", undefined, null, input.title);
    return task;
  });
}

export interface TaskFilters {
  status?: string;
  assigneeId?: string;
  teamId?: string;
  ticketId?: string;
}

export async function listTasks(ctx: AuthContext, filters: TaskFilters) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const and: Prisma.TaskWhereInput[] = [taskReadFilter(ctx)];
    if (filters.status) and.push({ status: filters.status as TaskStatus });
    if (filters.assigneeId) and.push({ assigneeId: filters.assigneeId });
    if (filters.teamId) and.push({ teamId: filters.teamId });
    if (filters.ticketId) and.push({ ticketId: filters.ticketId });
    return tx.task.findMany({
      where: { AND: and },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, status: true, priority: true, dueAt: true, teamId: true, ticketId: true,
        assignee: { select: { id: true, name: true } },
        team: { select: { name: true } },
      },
      take: 300,
    });
  });
}

export async function getTask(ctx: AuthContext, id: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const task = await tx.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: "asc" } },
        history: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!task) throw new NotFoundError("Task not found");
    if (!canReadTask(ctx, task)) throw new ForbiddenError();
    return { task, canWrite: canWriteTask(ctx, task) };
  });
}

async function loadWritableTask(tx: Tx, ctx: AuthContext, id: string) {
  const task = await tx.task.findUnique({ where: { id } });
  if (!task) throw new NotFoundError("Task not found");
  if (!canWriteTask(ctx, task)) throw new ForbiddenError();
  return task;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string | null;
  dueAt?: string | null;
}

export async function updateTask(ctx: AuthContext, id: string, patch: UpdateTaskInput) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const task = await loadWritableTask(tx, ctx, id);
    // Unchecked input so scalar FKs (assigneeId) can be set directly.
    const data: Prisma.TaskUncheckedUpdateInput = { updatedById: ctx.userId };

    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.dueAt !== undefined) data.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId;

    const updated = await tx.task.update({ where: { id }, data });

    if (patch.status !== undefined && patch.status !== task.status) {
      await recordTaskHistory(tx, ctx, id, "status_changed", "status", task.status, patch.status);
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
      await recordTaskHistory(tx, ctx, id, "assigned", "assignee", task.assigneeId ?? "", patch.assigneeId ?? "");
      if (patch.assigneeId) {
        const a = await tx.user.findUnique({ where: { id: patch.assigneeId }, select: { id: true, email: true } });
        if (a) {
          await notify(tx, {
            tenantId: ctx.tenantId, type: "task_assigned", recipients: [{ userId: a.id, email: a.email }],
            title: `Task assigned: ${task.title}`, body: `You have been assigned a task.`,
            entityType: "task", entityId: id,
          });
        }
      }
    }
    return updated;
  });
}

export async function deleteTask(ctx: AuthContext, id: string) {
  requirePermission(ctx, "task.delete");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const task = await loadWritableTask(tx, ctx, id);
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId, teamId: task.teamId,
      action: "task.deleted", entityType: "task", entityId: id, metadata: { title: task.title },
    });
    await tx.task.delete({ where: { id } });
    return { ok: true };
  });
}

export async function addTaskComment(ctx: AuthContext, id: string, body: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundError("Task not found");
    if (!canReadTask(ctx, task)) throw new ForbiddenError();
    const comment = await tx.taskComment.create({
      data: { tenantId: ctx.tenantId, taskId: id, authorId: ctx.userId, body },
    });
    await recordTaskHistory(tx, ctx, id, "commented");
    return comment;
  });
}
