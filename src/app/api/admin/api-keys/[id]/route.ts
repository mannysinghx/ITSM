import { requireAuth } from "@/lib/auth/require";
import { revokeApiKey } from "@/lib/integrations/apikeys";
import { ok, handleError } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await revokeApiKey(ctx, id));
  } catch (e) {
    return handleError(e);
  }
}
