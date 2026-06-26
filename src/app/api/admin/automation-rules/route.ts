import { requireAuth } from "@/lib/auth/require";
import { listRules, createRule } from "@/lib/admin/automation";
import { ruleSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ rules: await listRules(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = ruleSchema.parse(await req.json());
    return ok(await createRule(ctx, input), 201);
  } catch (e) {
    return handleError(e);
  }
}
