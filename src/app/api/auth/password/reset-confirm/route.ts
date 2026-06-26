import { z } from "zod";
import { confirmPasswordReset } from "@/lib/auth/email-flows";
import { ok, handleError } from "@/lib/api";

const schema = z.object({ token: z.string(), password: z.string().min(8).max(200) });

export async function POST(req: Request) {
  try {
    const { token, password } = schema.parse(await req.json());
    return ok(await confirmPasswordReset(token, password));
  } catch (e) {
    return handleError(e);
  }
}
