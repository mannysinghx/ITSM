import { requireAuth } from "@/lib/auth/require";
import { setUserStatus, assignRole, assignTeam } from "@/lib/admin/users";
import { userActionSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { userId } = await params;
    const body = userActionSchema.parse(await req.json());

    switch (body.action) {
      case "suspend":
        return ok(await setUserStatus(ctx, userId, "suspended"));
      case "reactivate":
        return ok(await setUserStatus(ctx, userId, "active"));
      case "assignRole":
        return ok(await assignRole(ctx, userId, body.roleId, body.teamId));
      case "assignTeam":
        return ok(await assignTeam(ctx, userId, body.teamId, body.roleId));
    }
  } catch (e) {
    return handleError(e);
  }
}
