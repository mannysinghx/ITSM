import { requireAuth } from "@/lib/auth/require";
import { decideApproval } from "@/lib/catalog/approvals";
import { approvalDecisionSchema } from "@/lib/catalog/validation";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const { comment } = approvalDecisionSchema.parse(await req.json().catch(() => ({})));
    return ok(await decideApproval(ctx, id, "approved", comment));
  } catch (e) {
    return handleError(e);
  }
}
