import { requireAuth } from "@/lib/auth/require";
import { getBilling } from "@/lib/billing/service";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await getBilling(ctx));
  } catch (e) {
    return handleError(e);
  }
}
