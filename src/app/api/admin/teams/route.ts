import { requireAuth } from "@/lib/auth/require";
import { listTeams, createTeam } from "@/lib/admin/teams";
import { createTeamSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ teams: await listTeams(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const { name, description } = createTeamSchema.parse(await req.json());
    return ok(await createTeam(ctx, name, description), 201);
  } catch (e) {
    return handleError(e);
  }
}
