import { requireAuth } from "@/lib/auth/require";
import { listApprovalInbox } from "@/lib/catalog/approvals";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ approvals: await listApprovalInbox(ctx) });
  } catch (e) {
    return handleError(e);
  }
}
