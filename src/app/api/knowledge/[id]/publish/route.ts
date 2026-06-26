import { requireAuth } from "@/lib/auth/require";
import { publishArticle } from "@/lib/knowledge/service";
import { ok, handleError } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await publishArticle(ctx, id));
  } catch (e) {
    return handleError(e);
  }
}
