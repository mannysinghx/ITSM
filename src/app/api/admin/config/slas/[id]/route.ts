import { requireAuth } from "@/lib/auth/require";
import { updateSlaPolicy } from "@/lib/admin/slas";
import { slaPolicyUpdateSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const patch = slaPolicyUpdateSchema.parse(await req.json());
    return ok(await updateSlaPolicy(ctx, id, patch));
  } catch (e) {
    return handleError(e);
  }
}
