import { requireAuth } from "@/lib/auth/require";
import { getArticle, updateArticle } from "@/lib/knowledge/service";
import { updateKnowledgeSchema } from "@/lib/ai/validation";
import { ok, handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await getArticle(ctx, id));
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const patch = updateKnowledgeSchema.parse(await req.json());
    return ok(await updateArticle(ctx, id, patch));
  } catch (e) {
    return handleError(e);
  }
}
