import { requireAuth } from "@/lib/auth/require";
import { inviteUser } from "@/lib/admin/users";
import { inviteUserSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = inviteUserSchema.parse(await req.json());
    return ok(await inviteUser(ctx, input), 201);
  } catch (e) {
    return handleError(e);
  }
}
