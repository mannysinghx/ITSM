import { loginSchema } from "@/lib/validation";
import { authenticate, listUserTenants } from "@/lib/auth/login";
import { createSession } from "@/lib/auth/session";
import { ok, fail, handleError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const { email, password } = loginSchema.parse(await req.json());
    const user = await authenticate(email, password);
    if (!user) return fail("Invalid email or password", 401);

    const tenants = await listUserTenants(user.id);
    // Default to the first tenant; a full switcher UI lands in a later phase.
    const active = tenants[0] ?? null;
    await createSession(user.id, active?.id ?? null);

    return ok({
      tenants,
      activeTenantId: active?.id ?? null,
      redirect: active ? "/app/dashboard" : "/app",
    });
  } catch (e) {
    return handleError(e);
  }
}
