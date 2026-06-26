import { requireAuth } from "@/lib/auth/require";
import { updateRule, deleteRule } from "@/lib/admin/automation";
import { ruleUpdateSchema } from "@/lib/admin/validation";
import { ok, handleError } from "@/lib/api";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const patch = ruleUpdateSchema.parse(await req.json());
    return ok(await updateRule(ctx, id, patch));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return ok(await deleteRule(ctx, id));
  } catch (e) {
    return handleError(e);
  }
}
