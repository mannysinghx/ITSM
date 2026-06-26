import { requireAuth } from "@/lib/auth/require";
import { listNotifications } from "@/lib/notifications/service";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await listNotifications(ctx));
  } catch (e) {
    return handleError(e);
  }
}
