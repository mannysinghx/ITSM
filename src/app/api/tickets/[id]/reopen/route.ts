import { requireAuth } from "@/lib/auth/require";
import { changeStatus } from "@/lib/tickets/service";
import { REOPENED_STATUS_KEY } from "@/lib/tickets/config";
import { ok, handleError } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    // Reopen is gated by the write gate inside changeStatus (canWriteTicket).
    await changeStatus(ctx, id, REOPENED_STATUS_KEY);
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
