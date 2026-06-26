import { requireAuth } from "@/lib/auth/require";
import { generateKnowledgeArticle } from "@/lib/ai/service";
import { generateArticleSchema } from "@/lib/ai/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = generateArticleSchema.parse(await req.json());
    return ok(await generateKnowledgeArticle(ctx, input));
  } catch (e) {
    return handleError(e);
  }
}
