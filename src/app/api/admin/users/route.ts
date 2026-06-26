import { requireAuth } from "@/lib/auth/require";
import { listUsers } from "@/lib/admin/users";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ users: await listUsers(ctx) });
  } catch (e) {
    return handleError(e);
  }
}
