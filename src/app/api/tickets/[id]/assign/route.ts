import { requireAuth } from "@/lib/auth/require";
import { assignTicket } from "@/lib/tickets/service";
import { assignSchema } from "@/lib/tickets/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const { assigneeId } = assignSchema.parse(await req.json());
    await assignTicket(ctx, id, assigneeId);
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
