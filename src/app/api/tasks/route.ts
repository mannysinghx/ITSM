import { requireAuth } from "@/lib/auth/require";
import { createTask, listTasks } from "@/lib/tasks/service";
import { createTaskSchema } from "@/lib/tasks/validation";
import { ok, handleError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const tasks = await listTasks(ctx, {
      status: url.searchParams.get("status") ?? undefined,
      assigneeId: url.searchParams.get("assignee") ?? undefined,
      teamId: url.searchParams.get("team") ?? undefined,
      ticketId: url.searchParams.get("ticket") ?? undefined,
    });
    return ok({ tasks });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = createTaskSchema.parse(await req.json());
    const task = await createTask(ctx, input);
    return ok({ id: task.id }, 201);
  } catch (e) {
    return handleError(e);
  }
}
