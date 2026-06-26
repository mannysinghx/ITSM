import { requireAuth } from "@/lib/auth/require";
import { requestEmailVerification } from "@/lib/auth/email-flows";
import { ok, handleError } from "@/lib/api";

export async function POST() {
  try {
    const ctx = await requireAuth();
    const { token } = await requestEmailVerification(ctx.userId);
    // Token returned for dev/test only; production delivers it via email.
    return ok({ sent: true, ...(process.env.NODE_ENV !== "production" ? { token } : {}) });
  } catch (e) {
    return handleError(e);
  }
}
