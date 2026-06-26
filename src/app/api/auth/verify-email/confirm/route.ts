import { z } from "zod";
import { confirmEmailVerification } from "@/lib/auth/email-flows";
import { ok, handleError } from "@/lib/api";

const schema = z.object({ token: z.string() });

export async function POST(req: Request) {
  try {
    const { token } = schema.parse(await req.json());
    return ok(await confirmEmailVerification(token));
  } catch (e) {
    return handleError(e);
  }
}
