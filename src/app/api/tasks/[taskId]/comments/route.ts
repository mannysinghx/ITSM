import { requireAuth } from "@/lib/auth/require";
import { addTaskComment } from "@/lib/tasks/service";
import { taskCommentSchema } from "@/lib/tasks/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { taskId } = await params;
    const { body } = taskCommentSchema.parse(await req.json());
    const c = await addTaskComment(ctx, taskId, body);
    return ok({ id: c.id }, 201);
  } catch (e) {
    return handleError(e);
  }
}
