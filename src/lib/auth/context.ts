import { prisma, withTenant, withUser } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/authz";

/**
 * Builds the request's AuthContext from the session (ADR-3). The active tenant comes
 * ONLY from the session — never from request input (ADR-2 IDOR guard). Returns null
 * if unauthenticated, no active tenant, or the user is not an active member of it.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session?.activeTenantId) return null;

  const { userId, activeTenantId: tenantId } = session;

  // MFA gate (Phase 8): an enrolled user must satisfy the challenge before app access.
  if (!session.mfaSatisfied) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true } });
    if (u?.mfaEnabled) return null;
  }

  // Confirm active membership (cross-tenant lookup via user context).
  const member = await withUser(userId, (tx) =>
    tx.tenantMembership.findFirst({
      where: { tenantId, userId, status: "active" },
      select: { id: true },
    }),
  );
  if (!member) return null;

  return withTenant(tenantId, userId, async (tx) => {
    const teamMemberships = await tx.teamMembership.findMany({
      where: { userId },
      select: { teamId: true, roleId: true },
    });

    const assignments = await tx.userRoleAssignment.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { roleId: true },
    });

    const roleIds = Array.from(
      new Set([
        ...assignments.map((a) => a.roleId),
        ...teamMemberships.map((m) => m.roleId).filter((r): r is string => !!r),
      ]),
    );

    // roles / role_permissions / permissions are global config tables (not RLS).
    const rolePerms = roleIds.length
      ? await prisma.rolePermission.findMany({
          where: { roleId: { in: roleIds } },
          select: { permission: { select: { key: true } } },
        })
      : [];

    return {
      userId,
      tenantId,
      teamIds: teamMemberships.map((m) => m.teamId),
      permissionKeys: new Set(rolePerms.map((rp) => rp.permission.key)),
    } satisfies AuthContext;
  });
}
