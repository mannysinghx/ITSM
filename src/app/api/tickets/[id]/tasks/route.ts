import { requireAuth } from "@/lib/auth/require";
import { listTasks } from "@/lib/tasks/service";
import { ok, handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const tasks = await listTasks(ctx, { ticketId: id });
    return ok({ tasks });
  } catch (e) {
    return handleError(e);
  }
}
