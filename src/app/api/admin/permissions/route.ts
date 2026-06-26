import { requireAuth } from "@/lib/auth/require";
import { requirePermission } from "@/lib/authz";
import { listPermissions } from "@/lib/admin/roles";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "role.manage");
    return ok({ permissions: listPermissions() });
  } catch (e) {
    return handleError(e);
  }
}
