import { requireAuth } from "@/lib/auth/require";
import { getAdminOverview } from "@/lib/admin/audit";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await getAdminOverview(ctx));
  } catch (e) {
    return handleError(e);
  }
}
