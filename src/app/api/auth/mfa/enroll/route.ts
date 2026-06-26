import { requireAuth } from "@/lib/auth/require";
import { beginEnroll } from "@/lib/auth/mfa-service";
import { ok, handleError } from "@/lib/api";

export async function POST() {
  try {
    const ctx = await requireAuth();
    return ok(await beginEnroll(ctx.userId));
  } catch (e) {
    return handleError(e);
  }
}
