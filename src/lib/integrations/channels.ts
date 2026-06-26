import { withTenant } from "@/lib/db";

/**
 * Outbound channel adapters (mock transports — no real Slack/Teams/HTTP in MVP, ADR-10).
 * These run in the WORKER, not inline (ADR-9): the engine records deferred steps; this
 * processor delivers them. A real deployment swaps these for signed HTTP/webhook calls
 * with retry.
 */
export async function deliverMock(kind: string, payload: unknown): Promise<{ ok: boolean }> {
  if (process.env.NODE_ENV !== "test") {
    console.log(`[channel:${kind}] deliver`, JSON.stringify(payload).slice(0, 120));
  }
  return { ok: true };
}

/**
 * Processes deferred automation steps for a tenant (webhook/slack/teams/escalate),
 * delivering each via the mock transport and stamping the step ok. Idempotent: only
 * picks up steps still in `deferred` status. Background-compatible (no HTTP/session).
 */
export async function processDeferredSteps(tenantId: string): Promise<{ delivered: number }> {
  return withTenant(tenantId, undefined, async (tx) => {
    const steps = await tx.workflowRunStep.findMany({ where: { status: "deferred" } });
    let delivered = 0;
    for (const step of steps) {
      const res = await deliverMock(step.actionType, step.input);
      await tx.workflowRunStep.update({
        where: { id: step.id },
        data: { status: res.ok ? "ok" : "error", output: { delivered: res.ok } as object },
      });
      // Webhook delivery bookkeeping.
      if (step.actionType === "call_webhook") {
        const url = (step.input as { url?: string }).url;
        if (url) {
          await tx.webhook.updateMany({ where: { url }, data: { lastStatus: "ok", lastDeliveryAt: new Date() } });
        }
      }
      delivered++;
    }
    return { delivered };
  });
}
