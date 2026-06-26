import { requireAuth } from "@/lib/auth/require";
import { listCatalog } from "@/lib/catalog/service";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ items: await listCatalog(ctx) });
  } catch (e) {
    return handleError(e);
  }
}
