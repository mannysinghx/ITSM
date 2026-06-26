import { requireAuth } from "@/lib/auth/require";
import { listSlaPolicies, createSlaPolicy } from "@/lib/admin/slas";
import { slaPolicySchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ policies: await listSlaPolicies(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = slaPolicySchema.parse(await req.json());
    return ok(await createSlaPolicy(ctx, input), 201);
  } catch (e) {
    return handleError(e);
  }
}
