import { z } from "zod";
import { requireAuth } from "@/lib/auth/require";
import { setPlan } from "@/lib/billing/service";
import { ok, handleError } from "@/lib/api";

const schema = z.object({ plan: z.enum(["free", "team", "company", "enterprise"]) });

export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    const { plan } = schema.parse(await req.json());
    return ok(await setPlan(ctx, plan));
  } catch (e) {
    return handleError(e);
  }
}
