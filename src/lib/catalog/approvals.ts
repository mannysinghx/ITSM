import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { type AuthContext, ForbiddenError, hasPermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { recordHistory } from "@/lib/tickets/history";
import { notify, type Recipient } from "@/lib/notifications/service";
import { NotFoundError, ValidationError } from "@/lib/errors";

/** A step in a catalog item's approvalChain JSON. */
export type ChainStep =
  | { type: "user"; userId: string }
  | { type: "team_manager" }
  | { type: "role"; roleKey: string };

interface ResolvedStep {
  approverUserId: string | null;
  approverRole: string | null;
  recipients: Recipient[];
}

async function teamManagers(tx: Tx, teamId: string): Promise<Recipient[]> {
  const rows = await tx.teamMembership.findMany({
    where: { teamId, role: { key: "team_manager" } },
    select: { user: { select: { id: true, email: true } } },
  });
  return rows.map((r) => ({ userId: r.user.id, email: r.user.email }));
}

async function roleHolders(tx: Tx, tenantId: string, roleKey: string): Promise<Recipient[]> {
  const assignments = await tx.userRoleAssignment.findMany({
    where: { role: { key: roleKey, OR: [{ tenantId }, { tenantId: null }] } },
    select: { user: { select: { id: true, email: true } } },
  });
  return assignments.map((a) => ({ userId: a.user.id, email: a.user.email }));
}

async function resolveStep(
  tx: Tx,
  tenantId: string,
  step: ChainStep,
  ticketTeamId: string,
): Promise<ResolvedStep> {
  if (step.type === "user") {
    const u = await tx.user.findUnique({ where: { id: step.userId }, select: { id: true, email: true } });
    return { approverUserId: step.userId, approverRole: null, recipients: u ? [{ userId: u.id, email: u.email }] : [] };
  }
  if (step.type === "team_manager") {
    const mgrs = await teamManagers(tx, ticketTeamId);
    return { approverUserId: mgrs[0]?.userId ?? null, approverRole: mgrs.length ? null : "team_manager", recipients: mgrs };
  }
  // role
  const holders = await roleHolders(tx, tenantId, step.roleKey);
  return { approverUserId: null, approverRole: step.roleKey, recipients: holders };
}

/** Returns the keys of all roles the user holds in the tenant (for role-based approval auth). */
async function roleKeysFor(tx: Tx, tenantId: string, userId: string): Promise<Set<string>> {
  const [assignments, teamMems] = await Promise.all([
    tx.userRoleAssignment.findMany({ where: { userId }, select: { role: { select: { key: true } } } }),
    tx.teamMembership.findMany({ where: { userId }, select: { role: { select: { key: true } } } }),
  ]);
  const keys = new Set<string>();
  for (const a of assignments) keys.add(a.role.key);
  for (const m of teamMems) if (m.role) keys.add(m.role.key);
  return keys;
}

/**
 * Materializes the approval chain for a ticket: one row per step (sequence 0..n, all
 * pending), then opens step 0 — emits approval.requested + notifies its approver(s)
 * (ADR-6). Caller is responsible for setting the ticket to waiting_on_approval.
 */
export async function materializeApprovals(
  tx: Tx,
  tenantId: string,
  actorId: string,
  ticketId: string,
  teamId: string,
  chain: ChainStep[],
): Promise<number> {
  if (chain.length === 0) return 0;

  let firstRecipients: Recipient[] = [];
  for (let i = 0; i < chain.length; i++) {
    const resolved = await resolveStep(tx, tenantId, chain[i], teamId);
    await tx.approval.create({
      data: {
        tenantId, ticketId, sequence: i,
        approverUserId: resolved.approverUserId, approverRole: resolved.approverRole,
        status: "pending",
      },
    });
    if (i === 0) firstRecipients = resolved.recipients;
  }

  await emitApprovalRequested(tx, tenantId, ticketId, teamId, 0, firstRecipients, actorId);
  return chain.length;
}

async function emitApprovalRequested(
  tx: Tx,
  tenantId: string,
  ticketId: string,
  teamId: string,
  sequence: number,
  recipients: Recipient[],
  actorId: string | null,
) {
  await writeAudit(tx, {
    tenantId, actorId, teamId,
    action: "approval.requested", entityType: "ticket", entityId: ticketId,
    metadata: { sequence },
  });
  await notify(tx, {
    tenantId, type: "approval_requested", recipients,
    title: "Approval requested", body: "A request is awaiting your approval.",
    entityType: "ticket", entityId: ticketId,
  });
}

/** Sets a ticket's status by key as a system action (no write-gate; approval-driven). */
async function setTicketStatus(tx: Tx, tenantId: string, actorId: string, ticketId: string, key: string) {
  const status = await tx.ticketStatus.findUnique({
    where: { tenantId_key: { tenantId, key } }, select: { id: true },
  });
  if (!status) return;
  const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { statusId: true, teamId: true } });
  if (!ticket) return;
  await tx.ticket.update({ where: { id: ticketId }, data: { statusId: status.id } });
  await recordHistory(tx, {
    tenantId, ticketId, teamId: ticket.teamId, actorId,
    action: "status_changed", field: "status", newValue: key, metadata: { via: "approval" },
  });
}

export async function listApprovalInbox(ctx: AuthContext) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const pending = await tx.approval.findMany({
      where: { status: "pending" },
      include: { ticket: { select: { id: true, ticketNumber: true, title: true, teamId: true } } },
      orderBy: { sequence: "asc" },
    });
    const roleKeys = await roleKeysFor(tx, ctx.tenantId, ctx.userId);

    // Active step per ticket = lowest pending sequence.
    const activeSeq = new Map<string, number>();
    for (const a of pending) {
      if (!a.ticketId) continue;
      const cur = activeSeq.get(a.ticketId);
      if (cur === undefined || a.sequence < cur) activeSeq.set(a.ticketId, a.sequence);
    }

    return pending.filter((a) => {
      if (!a.ticketId || a.sequence !== activeSeq.get(a.ticketId)) return false;
      if (a.approverUserId === ctx.userId) return true;
      if (a.approverRole && roleKeys.has(a.approverRole)) return true;
      return false;
    }).map((a) => ({
      id: a.id, sequence: a.sequence, ticket: a.ticket,
    }));
  });
}

export async function decideApproval(
  ctx: AuthContext,
  approvalId: string,
  decision: "approved" | "rejected",
  comment?: string,
) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const approval = await tx.approval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new NotFoundError("Approval not found");
    if (approval.status !== "pending") throw new ValidationError("Approval already decided");
    if (!approval.ticketId) throw new ValidationError("Approval has no ticket");

    // Must be the active (lowest pending) step.
    const earlier = await tx.approval.findFirst({
      where: { ticketId: approval.ticketId, status: "pending", sequence: { lt: approval.sequence } },
      select: { id: true },
    });
    if (earlier) throw new ValidationError("An earlier approval step is still pending");

    // Authorize: designated approver, a holder of the approver role, or an admin.
    const roleKeys = await roleKeysFor(tx, ctx.tenantId, ctx.userId);
    const isApprover =
      approval.approverUserId === ctx.userId ||
      (approval.approverRole !== null && roleKeys.has(approval.approverRole)) ||
      hasPermission(ctx, "admin.configure");
    if (!isApprover) throw new ForbiddenError("You are not an approver for this step");

    const ticket = await tx.ticket.findUnique({
      where: { id: approval.ticketId }, select: { id: true, teamId: true, requesterId: true },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");

    await tx.approval.update({
      where: { id: approvalId },
      data: { status: decision, decidedById: ctx.userId, decidedAt: new Date(), comment: comment ?? null },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId, teamId: ticket.teamId,
      action: `approval.${decision}`, entityType: "ticket", entityId: ticket.id,
      metadata: { approvalId, sequence: approval.sequence, comment: comment ?? null },
    });

    if (decision === "rejected") {
      // Halt: skip remaining pending steps, cancel the ticket.
      await tx.approval.updateMany({
        where: { ticketId: ticket.id, status: "pending" }, data: { status: "skipped" },
      });
      await setTicketStatus(tx, ctx.tenantId, ctx.userId, ticket.id, "cancelled");
      await notify(tx, {
        tenantId: ctx.tenantId, type: "approval_rejected", recipients: [{ userId: ticket.requesterId }],
        title: "Request rejected", body: "Your request was rejected.",
        entityType: "ticket", entityId: ticket.id,
      });
      return { ok: true, decision, completed: true };
    }

    // Approved: advance to next pending step, or complete the chain.
    const next = await tx.approval.findFirst({
      where: { ticketId: ticket.id, status: "pending" },
      orderBy: { sequence: "asc" },
    });
    if (next) {
      const recipients = next.approverUserId
        ? await (async () => {
            const u = await tx.user.findUnique({ where: { id: next.approverUserId! }, select: { id: true, email: true } });
            return u ? [{ userId: u.id, email: u.email }] : [];
          })()
        : next.approverRole
          ? await roleHolders(tx, ctx.tenantId, next.approverRole)
          : [];
      await emitApprovalRequested(tx, ctx.tenantId, ticket.id, ticket.teamId, next.sequence, recipients, ctx.userId);
      return { ok: true, decision, completed: false };
    }

    // Last step approved → move ticket off waiting_on_approval.
    await setTicketStatus(tx, ctx.tenantId, ctx.userId, ticket.id, "triaged");
    await notify(tx, {
      tenantId: ctx.tenantId, type: "approval_approved", recipients: [{ userId: ticket.requesterId }],
      title: "Request approved", body: "Your request has been approved.",
      entityType: "ticket", entityId: ticket.id,
    });
    return { ok: true, decision, completed: true };
  });
}
