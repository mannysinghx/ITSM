import { companySignupSchema } from "@/lib/validation";
import { provisionCompany } from "@/lib/provisioning";
import { createSession } from "@/lib/auth/session";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const input = companySignupSchema.parse(await req.json());
    const { userId, tenantId } = await provisionCompany(input);
    await createSession(userId, tenantId);
    return ok({ tenantId, redirect: "/app/admin" }, 201);
  } catch (e) {
    return handleError(e);
  }
}
