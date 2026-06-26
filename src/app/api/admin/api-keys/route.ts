import { requireAuth } from "@/lib/auth/require";
import { listApiKeys, createApiKey } from "@/lib/integrations/apikeys";
import { apiKeySchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ keys: await listApiKeys(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const { name, scopes, expiresAt } = apiKeySchema.parse(await req.json());
    // The raw key is returned ONCE here and never stored.
    return ok(await createApiKey(ctx, name, scopes, expiresAt ? new Date(expiresAt) : undefined), 201);
  } catch (e) {
    return handleError(e);
  }
}
