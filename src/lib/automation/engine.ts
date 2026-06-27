import { withTenant, type Tx } from "@/lib/db";
import { recordHistory } from "@/lib/tickets/history";
import { notify } from "@/lib/notifications/service";
import { evaluateConditions, type Condition } from "@/lib/automation/conditions";

export interface EngineEvent {
  event: string; // ticket.created | ticket.updated | ticket.status_changed | ticket.assigned | comment.created
  entityType: "ticket" | "comment";
  entityId: string;
  actorId?: string | null;
}

interface Action {
  type: string;
  [k: string]: unknown;
}

const MAX_DEPTH = 5;
const SYNC = new Set([
  "set_priority", "assign_team", "assign_user", "add_tag",
  "send_notification", "create_task", "add_internal_note",
]);
// Anything with a wait/retry runs in the worker — never inline (ADR-9).
const DEFERRED = new Set(["call_webhook", "send_slack", "send_teams", "escalate"]);

/**
 * Central event dispatcher (ADR-9). Called AFTER the committing transaction of a ticket
 * mutation. Matches enabled automation rules, evaluates conditions, runs SYNCHRONOUS
 * actions inline and ENQUEUES deferred ones, recording every dispatch in workflow_runs /
 * workflow_run_steps (ADR-6). Loop-safe: a per-cascade `seen` set of dedupe keys plus a
 * depth cap guarantee a self-triggering rule terminates.
 */
export async function emitEvent(
  tenantId: string,
  evt: EngineEvent,
  opts: { depth?: number; seen?: Set<string>; sourceRunId?: string } = {},
): Promise<void> {
  const depth = opts.depth ?? 0;
  const seen = opts.seen ?? new Set<string>();
  if (depth > MAX_DEPTH) return;

  const rules = await withTenant(tenantId, undefined, (tx) =>
    // Explicit tenant filter (defense-in-depth): rules MUST be scoped to this tenant even
    // when the caller's role bypasses RLS (e.g. the owner role during seeding).
    tx.automationRule.findMany({ where: { tenantId, event: evt.event, enabled: true }, orderBy: { priority: "asc" } }),
  );

  for (const rule of rules) {
    const dedupeKey = `${rule.id}:${evt.entityType}:${evt.entityId}:${evt.event}`;
    if (seen.has(dedupeKey)) {
      await recordSkip(tenantId, evt, rule.id, depth, opts.sourceRunId, dedupeKey, "dedupe");
      continue;
    }
    seen.add(dedupeKey);

    const { runId, followUps } = await executeRule(tenantId, evt, rule, depth, opts.sourceRunId, dedupeKey);
    for (const followUp of followUps) {
      await emitEvent(tenantId, { ...evt, event: followUp }, { depth: depth + 1, seen, sourceRunId: runId });
    }
  }
}

async function recordSkip(
  tenantId: string, evt: EngineEvent, ruleId: string, depth: number,
  sourceRunId: string | undefined, dedupeKey: string, reason: string,
) {
  await withTenant(tenantId, undefined, (tx) =>
    tx.workflowRun.create({
      data: {
        tenantId, triggerEvent: evt.event, entityType: evt.entityType, entityId: evt.entityId,
        sourceRunId: sourceRunId ?? null, depth, ruleId, status: "skipped",
        dedupeKey, finishedAt: new Date(), error: reason,
      },
    }),
  );
}

async function executeRule(
  tenantId: string, evt: EngineEvent, rule: { id: string; conditions: unknown; actions: unknown },
  depth: number, sourceRunId: string | undefined, dedupeKey: string,
): Promise<{ runId: string; followUps: string[] }> {
  return withTenant(tenantId, undefined, async (tx) => {
    const ticket = evt.entityType === "ticket" ? await loadTicketSnapshot(tx, evt.entityId) : null;
    const conditions = (rule.conditions ?? []) as Condition[];

    if (ticket && !evaluateConditions(ticket.snapshot, conditions)) {
      const run = await tx.workflowRun.create({
        data: {
          tenantId, triggerEvent: evt.event, entityType: evt.entityType, entityId: evt.entityId,
          sourceRunId: sourceRunId ?? null, depth, ruleId: rule.id, status: "skipped",
          dedupeKey, finishedAt: new Date(), error: "conditions_not_met",
        },
      });
      return { runId: run.id, followUps: [] };
    }

    const run = await tx.workflowRun.create({
      data: {
        tenantId, triggerEvent: evt.event, entityType: evt.entityType, entityId: evt.entityId,
        sourceRunId: sourceRunId ?? null, depth, ruleId: rule.id, status: "matched", dedupeKey,
      },
    });

    const actions = (rule.actions ?? []) as Action[];
    const followUps = new Set<string>();
    let anyDeferred = false;
    let anyError = false;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        if (DEFERRED.has(action.type)) {
          // ADR-9: enqueue, never run inline. MVP records the deferral for the worker.
          await tx.workflowRunStep.create({
            data: { tenantId, runId: run.id, stepIndex: i, actionType: action.type, input: action as object, status: "deferred" },
          });
          anyDeferred = true;
          continue;
        }
        if (!SYNC.has(action.type)) {
          await tx.workflowRunStep.create({
            data: { tenantId, runId: run.id, stepIndex: i, actionType: action.type, input: action as object, status: "error", error: "unknown_action" },
          });
          anyError = true;
          continue;
        }
        const out = await runSyncAction(tx, tenantId, evt, action);
        await tx.workflowRunStep.create({
          data: { tenantId, runId: run.id, stepIndex: i, actionType: action.type, input: action as object, status: "ok", output: (out.output ?? {}) as object },
        });
        if (out.followUp) followUps.add(out.followUp);
      } catch (e) {
        await tx.workflowRunStep.create({
          data: { tenantId, runId: run.id, stepIndex: i, actionType: action.type, input: action as object, status: "error", error: String(e) },
        });
        anyError = true;
      }
    }

    await tx.workflowRun.update({
      where: { id: run.id },
      data: { status: anyError ? "failed" : anyDeferred ? "deferred" : "completed", finishedAt: new Date() },
    });
    return { runId: run.id, followUps: [...followUps] };
  });
}

async function loadTicketSnapshot(tx: Tx, ticketId: string) {
  const ticket = await tx.ticket.findUnique({
    where: { id: ticketId },
    include: { status: { select: { key: true, category: true } }, type: { select: { key: true } } },
  });
  if (!ticket) throw new Error("ticket_not_found");
  return {
    ticket,
    snapshot: {
      type: ticket.type.key, priority: ticket.priority, teamId: ticket.teamId,
      assigneeId: ticket.assigneeId, requesterId: ticket.requesterId, tags: ticket.tags,
      impact: ticket.impact, urgency: ticket.urgency, source: ticket.source, channel: ticket.channel,
      status: { key: ticket.status.key, category: ticket.status.category },
    } as Record<string, unknown>,
  };
}

/** Executes one synchronous action, reusing the ticket write path (history+audit, INV-5). */
async function runSyncAction(
  tx: Tx, tenantId: string, evt: EngineEvent, action: Action,
): Promise<{ output?: unknown; followUp?: string }> {
  const ticketId = evt.entityId;
  const actorId = evt.actorId ?? null;
  const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { teamId: true, priority: true, assigneeId: true, tags: true } });
  if (!ticket) throw new Error("ticket_not_found");

  switch (action.type) {
    case "set_priority": {
      const priority = action.value as "p1" | "p2" | "p3" | "p4";
      if (priority === ticket.priority) return { output: { unchanged: true } };
      await tx.ticket.update({ where: { id: ticketId }, data: { priority } });
      await recordHistory(tx, { tenantId, ticketId, teamId: ticket.teamId, actorId, action: "updated", field: "priority", oldValue: ticket.priority, newValue: priority, metadata: { via: "automation" } });
      return { output: { priority }, followUp: "ticket.updated" };
    }
    case "assign_team": {
      const teamId = action.teamId as string;
      // The target team MUST belong to this tenant (never cross-tenant).
      const ok = await tx.team.findFirst({ where: { id: teamId, tenantId }, select: { id: true } });
      if (!ok) throw new Error("assign_team: target team not in tenant");
      await tx.ticket.update({ where: { id: ticketId }, data: { teamId } });
      await recordHistory(tx, { tenantId, ticketId, teamId, actorId, action: "updated", field: "team", newValue: teamId, metadata: { via: "automation" } });
      return { output: { teamId }, followUp: "ticket.updated" };
    }
    case "assign_user": {
      const assigneeId = action.userId as string;
      await tx.ticket.update({ where: { id: ticketId }, data: { assigneeId } });
      await recordHistory(tx, { tenantId, ticketId, teamId: ticket.teamId, actorId, action: "assigned", field: "assignee", oldValue: ticket.assigneeId ?? "", newValue: assigneeId, metadata: { via: "automation" } });
      return { output: { assigneeId }, followUp: "ticket.assigned" };
    }
    case "add_tag": {
      const tag = action.value as string;
      if (ticket.tags.includes(tag)) return { output: { unchanged: true } };
      await tx.ticket.update({ where: { id: ticketId }, data: { tags: { push: tag } } });
      await recordHistory(tx, { tenantId, ticketId, teamId: ticket.teamId, actorId, action: "updated", field: "tags", newValue: tag, metadata: { via: "automation" } });
      return { output: { tag }, followUp: "ticket.updated" };
    }
    case "send_notification": {
      const recipients = (action.userIds as string[] | undefined)?.map((userId) => ({ userId })) ?? [];
      await notify(tx, { tenantId, type: "automation", recipients, title: String(action.title ?? "Automation"), body: String(action.body ?? ""), entityType: "ticket", entityId: ticketId });
      return { output: { notified: recipients.length } };
    }
    case "create_task": {
      const task = await tx.task.create({ data: { tenantId, teamId: ticket.teamId, ticketId, title: String(action.title ?? "Automated task"), createdById: actorId ?? (await firstUser(tx, tenantId)) } });
      return { output: { taskId: task.id } };
    }
    case "add_internal_note": {
      await tx.ticketComment.create({ data: { tenantId, ticketId, authorId: actorId ?? (await firstUser(tx, tenantId)), body: String(action.body ?? ""), isInternal: true } });
      return { output: { noted: true } };
    }
    default:
      throw new Error("unknown_action");
  }
}

async function firstUser(tx: Tx, tenantId: string): Promise<string> {
  const m = await tx.tenantMembership.findFirst({ where: { tenantId }, select: { userId: true } });
  return m!.userId;
}

/** Fire-and-forget emit: automation failures must never break the user's operation. */
export async function safeEmit(tenantId: string, evt: EngineEvent): Promise<void> {
  try {
    await emitEvent(tenantId, evt);
  } catch (e) {
    console.error("[automation] emit failed:", e);
  }
}
