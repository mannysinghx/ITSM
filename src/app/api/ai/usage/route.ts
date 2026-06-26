import { requireAuth } from "@/lib/auth/require";
import { getUsage } from "@/lib/ai/service";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await getUsage(ctx));
  } catch (e) {
    return handleError(e);
  }
}
