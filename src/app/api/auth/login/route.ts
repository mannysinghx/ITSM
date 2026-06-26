import { loginSchema } from "@/lib/validation";
import { authenticate, listUserTenants } from "@/lib/auth/login";
import { createSession } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/ratelimit";
import { ok, fail, handleError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    // Rate limit login attempts per IP (brute-force protection, Phase 8).
    const rl = rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    if (!rl.allowed) return fail("Too many attempts, slow down", 429);

    const { email, password } = loginSchema.parse(await req.json());
    const result = await authenticate(email, password);
    if (!result.ok) {
      return fail(result.reason === "locked" ? "Account locked, try again later" : "Invalid email or password", result.reason === "locked" ? 423 : 401);
    }

    const tenants = await listUserTenants(result.id);
    const active = tenants[0] ?? null;
    // MFA-enabled users get an unsatisfied session and must pass the challenge first.
    await createSession(result.id, active?.id ?? null, !result.mfaEnabled);

    if (result.mfaEnabled) {
      return ok({ mfaRequired: true, tenants, activeTenantId: active?.id ?? null });
    }
    return ok({ tenants, activeTenantId: active?.id ?? null, redirect: active ? "/app/dashboard" : "/app" });
  } catch (e) {
    return handleError(e);
  }
}
