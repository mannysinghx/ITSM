import { z } from "zod";
import { requireAuth } from "@/lib/auth/require";
import { confirmEnroll } from "@/lib/auth/mfa-service";
import { ok, handleError } from "@/lib/api";

const schema = z.object({ code: z.string().min(6).max(8) });

/** Confirms MFA enrolment; returns the one-time recovery codes. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const { code } = schema.parse(await req.json());
    return ok(await confirmEnroll(ctx.userId, code));
  } catch (e) {
    return handleError(e);
  }
}
