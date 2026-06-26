import { destroySession } from "@/lib/auth/session";
import { ok, handleError } from "@/lib/api";

export async function POST() {
  try {
    await destroySession();
    return ok({ redirect: "/login" });
  } catch (e) {
    return handleError(e);
  }
}
