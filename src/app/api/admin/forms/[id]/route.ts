import { requireAuth } from "@/lib/auth/require";
import { updateForm } from "@/lib/admin/catalog";
import { formUpdateSchema } from "@/lib/catalog/validation";
import { ok, handleError } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const patch = formUpdateSchema.parse(await req.json());
    return ok(await updateForm(ctx, id, patch));
  } catch (e) {
    return handleError(e);
  }
}
