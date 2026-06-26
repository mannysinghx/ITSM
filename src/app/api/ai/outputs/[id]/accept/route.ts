import { requireAuth } from "@/lib/auth/require";
import { decideOutput } from "@/lib/ai/service";
import { ok, handleError } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await decideOutput(ctx, id, true));
  } catch (e) {
    return handleError(e);
  }
}
