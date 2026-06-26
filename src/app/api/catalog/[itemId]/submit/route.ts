import { requireAuth } from "@/lib/auth/require";
import { submitCatalog } from "@/lib/catalog/service";
import { submitSchema } from "@/lib/catalog/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { itemId } = await params;
    const { values } = submitSchema.parse(await req.json());
    const result = await submitCatalog(ctx, itemId, values);
    return ok(result, 201);
  } catch (e) {
    return handleError(e);
  }
}
