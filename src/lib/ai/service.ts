import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission, ForbiddenError } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { canReadTicket } from "@/lib/tickets/access";
import { getAiSettings, type AiSettings } from "@/lib/ai/settings";
import { route } from "@/lib/ai/router";
import { redact } from "@/lib/ai/redaction";
import type { UseCase } from "@/lib/ai/providers/types";
import { createArticleTx } from "@/lib/knowledge/service";

export interface AiRunResult {
  status: "ok" | "disabled" | "budget_blocked";
  requestId: string;
  outputId?: string;
  content?: unknown;
  aiSuggested?: boolean;
  isMock?: boolean;
  redacted?: boolean;
}

interface RunOpts {
  entityType?: string;
  entityId?: string;
  teamId?: string;
  context?: Record<string, unknown>;
}

/** Current token-usage window row for the tenant (created lazily). Budget reads this. */
async function currentUsage(tx: Tx, tenantId: string, windowDays: number) {
  const now = new Date();
  const existing = await tx.aITokenUsage.findFirst({
    where: { tenantId, periodEnd: { gt: now } }, orderBy: { periodEnd: "desc" },
  });
  if (existing) return existing;
  return tx.aITokenUsage.create({
    data: { tenantId, periodStart: now, periodEnd: new Date(now.getTime() + windowDays * 86_400_000) },
  });
}

/**
 * The single AI entry point (no route calls a provider directly). Per call: enforce
 * enabled + per-module toggle → budget hard-stop → PII redaction → route → provider →
 * log ai_requests + ai_outputs → update ai_token_usage, all inside `withTenant` (ADR-2).
 * Every output is stamped aiSuggested=true (guardrail).
 */
async function runAi(ctx: AuthContext, useCase: UseCase, prompt: string, opts: RunOpts = {}): Promise<AiRunResult> {
  requirePermission(ctx, "ai.use");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const settings = await getAiSettings(tx, ctx.tenantId);

    const logRequest = (status: "ok" | "disabled" | "budget_blocked", extra: Record<string, unknown> = {}) =>
      tx.aIRequest.create({
        data: {
          tenantId: ctx.tenantId, teamId: opts.teamId ?? null, userId: ctx.userId,
          useCase, provider: settings.provider, status,
          entityType: opts.entityType ?? null, entityId: opts.entityId ?? null,
          ...extra,
        },
      });

    if (!settings.enabled || settings.perModule[useCase] === false) {
      const req = await logRequest("disabled", { isMock: true });
      return { status: "disabled", requestId: req.id };
    }

    const usage = await currentUsage(tx, ctx.tenantId, settings.budget.windowDays);
    if (usage.promptTokens + usage.completionTokens >= settings.budget.tokenLimit) {
      const req = await logRequest("budget_blocked", { isMock: true });
      await writeAudit(tx, {
        tenantId: ctx.tenantId, actorId: ctx.userId,
        action: "ai.budget_blocked", entityType: "tenant", entityId: ctx.tenantId,
        metadata: { useCase },
      });
      return { status: "budget_blocked", requestId: req.id };
    }

    const { text: promptText, redacted } = settings.redaction.enabled
      ? redact(prompt)
      : { text: prompt, redacted: false };

    const { provider, model } = route(useCase, settings);
    const t0 = Date.now();
    const result = await provider.complete({ useCase, prompt: promptText, model, context: opts.context });
    const latencyMs = Date.now() - t0;

    const req = await tx.aIRequest.create({
      data: {
        tenantId: ctx.tenantId, teamId: opts.teamId ?? null, userId: ctx.userId,
        useCase, provider: provider.name, model: result.model, isMock: result.isMock, redacted,
        promptTokens: result.promptTokens, completionTokens: result.completionTokens,
        costUsd: result.costUsd, latencyMs, status: "ok",
        entityType: opts.entityType ?? null, entityId: opts.entityId ?? null,
      },
    });
    const output = await tx.aIOutput.create({
      data: {
        tenantId: ctx.tenantId, aiRequestId: req.id, outputType: useCase,
        content: result.content as object, aiSuggested: true,
      },
    });
    await tx.aITokenUsage.update({
      where: { id: usage.id },
      data: {
        promptTokens: { increment: result.promptTokens },
        completionTokens: { increment: result.completionTokens },
        costUsd: { increment: result.costUsd },
        requestCount: { increment: 1 },
      },
    });

    return {
      status: "ok", requestId: req.id, outputId: output.id,
      content: result.content, aiSuggested: true, isMock: result.isMock, redacted,
    };
  });
}

/** Loads a ticket's text (gated by read access) for ticket-based AI features. */
async function ticketText(ctx: AuthContext, ticketId: string): Promise<{ text: string; teamId: string }> {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: {
        title: true, description: true, teamId: true, requesterId: true, assigneeId: true,
        comments: { where: { isInternal: false }, select: { body: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");
    if (!canReadTicket(ctx, ticket)) throw new ForbiddenError();
    const text = [ticket.title, ticket.description, ...ticket.comments.map((c) => c.body)].join("\n");
    return { text, teamId: ticket.teamId };
  });
}

async function teamNames(ctx: AuthContext): Promise<string[]> {
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.team.findMany({ select: { name: true } }).then((ts) => ts.map((t) => t.name)),
  );
}

// --- The six MVP functions ---

export async function classifyTicket(ctx: AuthContext, input: { ticketId?: string; text?: string }) {
  const { text, teamId } = input.ticketId ? await ticketText(ctx, input.ticketId) : { text: input.text ?? "", teamId: undefined };
  return runAi(ctx, "classify", text, { entityType: "ticket", entityId: input.ticketId, teamId });
}

export async function suggestPriority(ctx: AuthContext, input: { ticketId?: string; text?: string }) {
  const { text, teamId } = input.ticketId ? await ticketText(ctx, input.ticketId) : { text: input.text ?? "", teamId: undefined };
  return runAi(ctx, "priority", text, { entityType: "ticket", entityId: input.ticketId, teamId });
}

export async function suggestTeam(ctx: AuthContext, input: { ticketId?: string; text?: string }) {
  const { text } = input.ticketId ? await ticketText(ctx, input.ticketId) : { text: input.text ?? "" };
  const teams = await teamNames(ctx);
  return runAi(ctx, "team", text, { entityType: "ticket", entityId: input.ticketId, context: { teams } });
}

export async function summarizeTicket(ctx: AuthContext, input: { ticketId?: string; text?: string }) {
  const { text, teamId } = input.ticketId ? await ticketText(ctx, input.ticketId) : { text: input.text ?? "", teamId: undefined };
  return runAi(ctx, "summarize", text, { entityType: "ticket", entityId: input.ticketId, teamId });
}

export async function draftTicketResponse(ctx: AuthContext, input: { ticketId?: string; text?: string }) {
  const { text, teamId } = input.ticketId ? await ticketText(ctx, input.ticketId) : { text: input.text ?? "", teamId: undefined };
  const result = await runAi(ctx, "draft", text, { entityType: "ticket", entityId: input.ticketId, teamId });
  // Guardrail: drafts are NEVER sent externally here; the send path is gated and lives in channels (Phase 7).
  return { ...result, externalSendAllowed: false };
}

export async function generateKnowledgeArticle(
  ctx: AuthContext,
  input: { ticketId?: string; text?: string; save?: boolean },
) {
  const { text } = input.ticketId ? await ticketText(ctx, input.ticketId) : { text: input.text ?? "" };
  const result = await runAi(ctx, "knowledge", text, { entityType: "ticket", entityId: input.ticketId });

  let articleId: string | undefined;
  if (input.save && result.status === "ok") {
    requirePermission(ctx, "knowledge.create");
    const c = result.content as { title: string; body: string };
    const article = await withTenant(ctx.tenantId, ctx.userId, (tx) =>
      createArticleTx(tx, ctx, {
        title: c.title, body: c.body, status: "draft",
        source: input.ticketId ? "ticket" : "ai", sourceTicketId: input.ticketId ?? null,
        aiGenerated: true,
      }),
    );
    articleId = article.id;
  }
  return { ...result, articleId };
}

/** Records a user's accept/reject of an AI suggestion (ADR-8). Does not auto-mutate the
 *  ticket — applying a suggestion goes through the normal ticket write path. */
export async function decideOutput(ctx: AuthContext, outputId: string, accepted: boolean) {
  requirePermission(ctx, "ai.use");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const output = await tx.aIOutput.findUnique({ where: { id: outputId }, select: { id: true } });
    if (!output) throw new NotFoundError("AI output not found");
    await tx.aIOutput.update({
      where: { id: outputId }, data: { accepted, acceptedByUserId: ctx.userId },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: accepted ? "ai.output_accepted" : "ai.output_rejected",
      entityType: "ai_output", entityId: outputId, metadata: {},
    });
    return { ok: true, accepted };
  });
}

/** Guardrail helper: refuse external auto-response unless the tenant explicitly allows it. */
export function assertCanSendExternal(settings: AiSettings): void {
  if (!settings.externalAutoResponseAllowed) {
    throw new ValidationError("External AI auto-response is not permitted for this tenant");
  }
}

export async function getUsage(ctx: AuthContext) {
  requirePermission(ctx, "ai.config.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const usage = await tx.aITokenUsage.findFirst({
      where: { tenantId: ctx.tenantId, periodEnd: { gt: new Date() } }, orderBy: { periodEnd: "desc" },
    });
    const settings = await getAiSettings(tx, ctx.tenantId);
    return {
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      requestCount: usage?.requestCount ?? 0,
      costUsd: usage?.costUsd ?? 0,
      limit: settings.budget.tokenLimit,
      windowDays: settings.budget.windowDays,
    };
  });
}
