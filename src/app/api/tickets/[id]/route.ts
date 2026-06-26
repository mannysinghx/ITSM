import { requireAuth } from "@/lib/auth/require";
import { getTicket, updateTicket } from "@/lib/tickets/service";
import { updateTicketSchema } from "@/lib/tickets/validation";
import { ok, handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const result = await getTicket(ctx, id);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const patch = updateTicketSchema.parse(await req.json());
    const updated = await updateTicket(ctx, id, patch);
    return ok({ id: updated.id });
  } catch (e) {
    return handleError(e);
  }
}
