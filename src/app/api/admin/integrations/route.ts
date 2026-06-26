import { requireAuth } from "@/lib/auth/require";
import { listIntegrations, createIntegration } from "@/lib/admin/integrations";
import { integrationSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ integrations: await listIntegrations(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = integrationSchema.parse(await req.json());
    return ok(await createIntegration(ctx, input), 201);
  } catch (e) {
    return handleError(e);
  }
}
