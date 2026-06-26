import { requireAuth } from "@/lib/auth/require";
import { listAuditLogs } from "@/lib/admin/audit";
import { ok, handleError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const logs = await listAuditLogs(ctx, {
      actorId: url.searchParams.get("actor") ?? undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
    });
    return ok({ logs });
  } catch (e) {
    return handleError(e);
  }
}
