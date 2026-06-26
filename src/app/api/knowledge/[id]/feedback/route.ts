import { requireAuth } from "@/lib/auth/require";
import { addFeedback } from "@/lib/knowledge/service";
import { feedbackSchema } from "@/lib/ai/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const { helpful, comment } = feedbackSchema.parse(await req.json());
    return ok(await addFeedback(ctx, id, helpful, comment));
  } catch (e) {
    return handleError(e);
  }
}
