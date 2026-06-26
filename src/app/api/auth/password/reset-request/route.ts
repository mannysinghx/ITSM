import { z } from "zod";
import { requestPasswordReset } from "@/lib/auth/email-flows";
import { rateLimit, clientIp } from "@/lib/auth/ratelimit";
import { ok, fail, handleError } from "@/lib/api";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  try {
    if (!rateLimit(`reset:${clientIp(req)}`, 5, 60_000).allowed) return fail("Too many attempts", 429);
    const { email } = schema.parse(await req.json());
    const r = await requestPasswordReset(email);
    // Always "sent" (no account enumeration). Token surfaced in dev/test only.
    return ok({ sent: true, ...(process.env.NODE_ENV !== "production" && r.token ? { token: r.token } : {}) });
  } catch (e) {
    return handleError(e);
  }
}
