import { prisma, withUser } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";

/** Verifies credentials. Returns the user id or null (no distinction leaked to caller). */
export async function authenticate(
  email: string,
  password: string,
): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status === "suspended") return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? { id: user.id } : null;
}

export interface TenantSummary {
  id: string;
  name: string;
  type: string;
}

/**
 * Lists the tenants a user belongs to (across tenants) — the legitimate pre-tenant
 * lookup, scoped by user context so RLS still only returns this user's memberships.
 */
export async function listUserTenants(userId: string): Promise<TenantSummary[]> {
  return withUser(userId, async (tx) => {
    const memberships = await tx.tenantMembership.findMany({
      where: { userId, status: "active" },
      select: { tenant: { select: { id: true, name: true, type: true } } },
    });
    return memberships.map((m) => m.tenant);
  });
}
