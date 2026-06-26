import { runAllWorkers } from "@/lib/workers/runner";
import { ok, fail } from "@/lib/api";

/**
 * Manual/HTTP trigger for the cross-tenant workers, guarded by a shared secret
 * (`CRON_SECRET`). The primary scheduler is the Railway cron service running
 * `scripts/run-workers.ts` in-process; this endpoint is a fallback / external trigger.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secret || provided !== secret) return fail("Unauthorized", 401);

  try {
    return ok(await runAllWorkers());
  } catch (e) {
    console.error("[workers] HTTP run failed:", e);
    return fail("Worker run failed", 500);
  }
}
