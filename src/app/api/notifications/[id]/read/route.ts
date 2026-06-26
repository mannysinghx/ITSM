import { requireAuth } from "@/lib/auth/require";
import { markRead } from "@/lib/notifications/service";
import { ok, handleError } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await markRead(ctx, id));
  } catch (e) {
    return handleError(e);
  }
}
