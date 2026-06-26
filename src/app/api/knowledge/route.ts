import { requireAuth } from "@/lib/auth/require";
import { listArticles, createArticle } from "@/lib/knowledge/service";
import { createKnowledgeSchema } from "@/lib/ai/validation";
import { ok, handleError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    return ok({ articles: await listArticles(ctx, url.searchParams.get("status") ?? undefined) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = createKnowledgeSchema.parse(await req.json());
    const article = await createArticle(ctx, input);
    return ok({ id: article.id }, 201);
  } catch (e) {
    return handleError(e);
  }
}
