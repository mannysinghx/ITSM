import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError, type AuthContext } from "@/lib/authz";

class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Resolves the AuthContext for an API route or throws UnauthenticatedError (mapped to
 * 401 by handleError). Centralizes the "every route authenticates first" rule.
 */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}

export { ForbiddenError };
