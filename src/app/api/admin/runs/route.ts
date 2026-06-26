import { requireAuth } from "@/lib/auth/require";
import { listRuns } from "@/lib/admin/automation";
import { ok, handleError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    return ok({ runs: await listRuns(ctx, url.searchParams.get("entity") ?? undefined) });
  } catch (e) {
    return handleError(e);
  }
}
