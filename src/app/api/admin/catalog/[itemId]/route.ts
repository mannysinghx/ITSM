import { requireAuth } from "@/lib/auth/require";
import { updateCatalogItem } from "@/lib/admin/catalog";
import { catalogItemUpdateSchema } from "@/lib/catalog/validation";
import { ok, handleError } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { itemId } = await params;
    const patch = catalogItemUpdateSchema.parse(await req.json());
    return ok(await updateCatalogItem(ctx, itemId, patch));
  } catch (e) {
    return handleError(e);
  }
}
