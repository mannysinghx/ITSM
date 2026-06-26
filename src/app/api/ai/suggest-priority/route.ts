import { requireAuth } from "@/lib/auth/require";
import { suggestPriority } from "@/lib/ai/service";
import { aiInputSchema } from "@/lib/ai/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = aiInputSchema.parse(await req.json());
    return ok(await suggestPriority(ctx, input));
  } catch (e) {
    return handleError(e);
  }
}
