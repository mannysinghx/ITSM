import { requireAuth } from "@/lib/auth/require";
import { getTask, updateTask, deleteTask } from "@/lib/tasks/service";
import { updateTaskSchema } from "@/lib/tasks/validation";
import { ok, handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { taskId } = await params;
    return ok(await getTask(ctx, taskId));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { taskId } = await params;
    const patch = updateTaskSchema.parse(await req.json());
    const updated = await updateTask(ctx, taskId, patch);
    return ok({ id: updated.id });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { taskId } = await params;
    return ok(await deleteTask(ctx, taskId));
  } catch (e) {
    return handleError(e);
  }
}
