import { requireAuth } from "@/lib/auth/require";
import { deleteIntegration } from "@/lib/admin/integrations";
import { ok, handleError } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await deleteIntegration(ctx, id));
  } catch (e) {
    return handleError(e);
  }
}
