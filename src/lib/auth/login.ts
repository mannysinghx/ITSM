import { prisma, withUser } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

export type AuthOutcome =
  | { ok: true; id: string; mfaEnabled: boolean }
  | { ok: false; reason: "invalid" | "locked" };

/**
 * Verifies credentials with brute-force protection (Phase 8): consecutive failures
 * increment failedLoginCount and lock the account for 15 minutes after 5; a success
 * resets the counter. The reason "invalid" never distinguishes unknown-user from
 * wrong-password (no enumeration).
 */
export async function authenticate(email: string, password: string): Promise<AuthOutcome> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status === "suspended") return { ok: false, reason: "invalid" };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: "locked" };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null },
    });
    return { ok: false, reason: lock ? "locked" : "invalid" };
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  }
  return { ok: true, id: user.id, mfaEnabled: user.mfaEnabled };
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
