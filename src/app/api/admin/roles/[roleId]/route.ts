import { requireAuth } from "@/lib/auth/require";
import { updateRole, cloneRole } from "@/lib/admin/roles";
import { updateRoleSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { roleId } = await params;
    const body = updateRoleSchema.parse(await req.json());
    if (body.cloneFrom) {
      return ok(await cloneRole(ctx, body.cloneFrom, body.name ?? "Cloned role"), 201);
    }
    return ok(await updateRole(ctx, roleId, { name: body.name, permissionKeys: body.permissionKeys }));
  } catch (e) {
    return handleError(e);
  }
}
