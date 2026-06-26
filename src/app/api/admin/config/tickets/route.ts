import { requireAuth } from "@/lib/auth/require";
import { getTicketConfig, mutateTicketConfig } from "@/lib/admin/config";
import { configMutationSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await getTicketConfig(ctx));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireAuth();
    const m = configMutationSchema.parse(await req.json());
    return ok(await mutateTicketConfig(ctx, m));
  } catch (e) {
    return handleError(e);
  }
}
