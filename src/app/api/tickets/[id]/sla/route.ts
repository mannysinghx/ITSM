import { requireAuth } from "@/lib/auth/require";
import { getTicketSla } from "@/lib/sla/view";
import { ok, handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await getTicketSla(ctx, id));
  } catch (e) {
    return handleError(e);
  }
}
