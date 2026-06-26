import { z } from "zod";
import { getSession, markMfaSatisfied } from "@/lib/auth/session";
import { verifyMfaCode } from "@/lib/auth/mfa-service";
import { ok, fail, handleError } from "@/lib/api";

const schema = z.object({ code: z.string().min(6).max(8) });

/** Login-time MFA challenge: verifies a TOTP code and marks the session satisfied. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("Not authenticated", 401);
    const { code } = schema.parse(await req.json());
    if (!(await verifyMfaCode(session.userId, code))) return fail("Invalid code", 401);
    await markMfaSatisfied(session.id);
    return ok({ redirect: "/app/dashboard" });
  } catch (e) {
    return handleError(e);
  }
}
