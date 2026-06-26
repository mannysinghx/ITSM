import { requireAuth } from "@/lib/auth/require";
import { getCatalogItem } from "@/lib/catalog/service";
import { ok, handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { itemId } = await params;
    return ok(await getCatalogItem(ctx, itemId));
  } catch (e) {
    return handleError(e);
  }
}
