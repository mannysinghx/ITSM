import { requireAuth } from "@/lib/auth/require";
import { requirePermission } from "@/lib/authz";
import { changeStatus } from "@/lib/tickets/service";
import { CLOSED_STATUS_KEY } from "@/lib/tickets/config";
import { ok, handleError } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "ticket.close");
    const { id } = await params;
    await changeStatus(ctx, id, CLOSED_STATUS_KEY);
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
