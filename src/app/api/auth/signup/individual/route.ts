import { individualSignupSchema } from "@/lib/validation";
import { provisionIndividual } from "@/lib/provisioning";
import { createSession } from "@/lib/auth/session";
import { ok, handleError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const input = individualSignupSchema.parse(await req.json());
    const { userId, tenantId } = await provisionIndividual(input);
    await createSession(userId, tenantId);
    return ok({ tenantId, redirect: "/app/dashboard" }, 201);
  } catch (e) {
    return handleError(e);
  }
}
