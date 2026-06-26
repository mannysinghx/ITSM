import { requireAuth } from "@/lib/auth/require";
import { addComment } from "@/lib/tickets/service";
import { commentSchema } from "@/lib/tickets/validation";
import { ok, handleError } from "@/lib/api";

/** Internal note — requires ticket.comment.internal; never shown to requesters (INV-4). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const { body } = commentSchema.parse(await req.json());
    const c = await addComment(ctx, id, body, true);
    return ok({ id: c.id }, 201);
  } catch (e) {
    return handleError(e);
  }
}
