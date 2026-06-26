import { withTenant } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/context";
import { requirePermission } from "@/lib/authz";
import { ok, fail, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return fail("Not authenticated", 401);
    requirePermission(ctx, "tenant.view");

    const tenant = await withTenant(ctx.tenantId, ctx.userId, (tx) =>
      tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: {
          id: true, name: true, slug: true, type: true, plan: true, createdAt: true,
          teams: { select: { id: true, name: true, slug: true, isDefault: true } },
        },
      }),
    );
    if (!tenant) return fail("Tenant not found", 404);
    return ok({ tenant });
  } catch (e) {
    return handleError(e);
  }
}
