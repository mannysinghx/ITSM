import { z } from "zod";
import { getSession, markMfaSatisfied } from "@/lib/auth/session";
import { consumeRecoveryCode } from "@/lib/auth/mfa-service";
import { ok, fail, handleError } from "@/lib/api";

const schema = z.object({ code: z.string().min(4) });

/** Login-time fallback: consumes a single recovery code to satisfy the MFA challenge. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("Not authenticated", 401);
    const { code } = schema.parse(await req.json());
    if (!(await consumeRecoveryCode(session.userId, code))) return fail("Invalid recovery code", 401);
    await markMfaSatisfied(session.id);
    return ok({ redirect: "/app/dashboard" });
  } catch (e) {
    return handleError(e);
  }
}
