import { requireAuth } from "@/lib/auth/require";
import { listWebhooks, createWebhook } from "@/lib/admin/integrations";
import { webhookSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ webhooks: await listWebhooks(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = webhookSchema.parse(await req.json());
    return ok(await createWebhook(ctx, input), 201);
  } catch (e) {
    return handleError(e);
  }
}
