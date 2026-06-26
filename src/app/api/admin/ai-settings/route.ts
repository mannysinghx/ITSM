import { requireAuth } from "@/lib/auth/require";
import { readAiSettings, updateAiSettings } from "@/lib/ai/settings";
import { aiSettingsSchema } from "@/lib/ai/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ settings: await readAiSettings(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    const patch = aiSettingsSchema.parse(await req.json());
    return ok({ settings: await updateAiSettings(ctx, patch) });
  } catch (e) {
    return handleError(e);
  }
}
