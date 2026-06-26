import { requireAuth } from "@/lib/auth/require";
import { getTicketMeta } from "@/lib/tickets/service";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await getTicketMeta(ctx));
  } catch (e) {
    return handleError(e);
  }
}
