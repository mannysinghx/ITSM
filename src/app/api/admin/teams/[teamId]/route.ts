import { requireAuth } from "@/lib/auth/require";
import { updateTeam, addTeamMember, removeTeamMember } from "@/lib/admin/teams";
import { teamActionSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { teamId } = await params;
    const body = teamActionSchema.parse(await req.json());

    switch (body.action) {
      case "edit":
        return ok(await updateTeam(ctx, teamId, { name: body.name, description: body.description }));
      case "archive":
        return ok(await updateTeam(ctx, teamId, { status: "archived" }));
      case "addMember":
        return ok(await addTeamMember(ctx, teamId, body.userId, body.roleId));
      case "removeMember":
        return ok(await removeTeamMember(ctx, teamId, body.userId));
    }
  } catch (e) {
    return handleError(e);
  }
}
