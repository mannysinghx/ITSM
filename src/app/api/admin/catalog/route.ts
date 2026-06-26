import { requireAuth } from "@/lib/auth/require";
import { listCatalogItems, createCatalogItem } from "@/lib/admin/catalog";
import { catalogItemSchema } from "@/lib/catalog/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ items: await listCatalogItems(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = catalogItemSchema.parse(await req.json());
    return ok(await createCatalogItem(ctx, input), 201);
  } catch (e) {
    return handleError(e);
  }
}
