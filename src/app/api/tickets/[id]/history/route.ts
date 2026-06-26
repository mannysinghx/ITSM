import { requireAuth } from "@/lib/auth/require";
import { listHistory } from "@/lib/tickets/service";
import { ok, handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const history = await listHistory(ctx, id);
    return ok({ history });
  } catch (e) {
    return handleError(e);
  }
}
