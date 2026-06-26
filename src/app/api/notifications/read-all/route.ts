import { requireAuth } from "@/lib/auth/require";
import { markAllRead } from "@/lib/notifications/service";
import { ok, handleError } from "@/lib/api";

export async function POST() {
  try {
    const ctx = await requireAuth();
    return ok(await markAllRead(ctx));
  } catch (e) {
    return handleError(e);
  }
}
