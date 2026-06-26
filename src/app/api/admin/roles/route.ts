import { requireAuth } from "@/lib/auth/require";
import { listRoles, createRole } from "@/lib/admin/roles";
import { createRoleSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ roles: await listRoles(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = createRoleSchema.parse(await req.json());
    return ok(await createRole(ctx, input), 201);
  } catch (e) {
    return handleError(e);
  }
}
