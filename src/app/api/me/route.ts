import { getAuthContext } from "@/lib/auth/context";
import { ok, fail, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return fail("Not authenticated", 401);
    return ok({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      teamIds: ctx.teamIds,
      permissions: Array.from(ctx.permissionKeys).sort(),
    });
  } catch (e) {
    return handleError(e);
  }
}
