/**
 * Scheduled worker entrypoint (run by the Railway cron service).
 * Runs the SLA + deferred-automation workers across all tenants, then exits.
 *
 *   pnpm tsx scripts/run-workers.ts
 */
import { runAllWorkers } from "@/lib/workers/runner";

runAllWorkers()
  .then((summary) => {
    console.log("[workers] complete:", JSON.stringify(summary));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[workers] fatal:", err);
    process.exit(1);
  });
