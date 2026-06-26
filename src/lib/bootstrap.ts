import { prisma } from "@/lib/db";
import {
  PERMISSIONS,
  DEFAULT_ROLES,
  resolveRolePermissions,
} from "@/lib/permissions";

/**
 * Idempotently seeds the global permission vocabulary and the system roles
 * (tenantId = null). Safe to run repeatedly. Called from the seed script and from
 * test setup. These are global config tables (not RLS), so the base client is used.
 */
export async function ensureSystemRolesAndPermissions(): Promise<void> {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description, category: p.category },
      create: p,
    });
  }

  const allPerms = await prisma.permission.findMany({ select: { id: true, key: true } });
  const permIdByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  for (const roleDef of DEFAULT_ROLES) {
    // Null tenantId makes the (tenant_id, key) unique constraint non-distinct in
    // Postgres, so upsert is unreliable here — find-then-write instead.
    const existing = await prisma.role.findFirst({
      where: { tenantId: null, key: roleDef.key },
      select: { id: true },
    });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: roleDef.name, description: roleDef.description },
        })
      : await prisma.role.create({
          data: {
            tenantId: null,
            key: roleDef.key,
            name: roleDef.name,
            description: roleDef.description,
            scope: "system",
            isSystem: true,
          },
        });

    const wantKeys = resolveRolePermissions(roleDef);
    const wantIds = wantKeys
      .map((k) => permIdByKey.get(k))
      .filter((id): id is string => !!id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: wantIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}

/** Looks up a system role id by key (e.g. "owner"). Throws if bootstrap not run. */
export async function systemRoleId(key: string): Promise<string> {
  const role = await prisma.role.findFirst({
    where: { tenantId: null, key },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `System role "${key}" not found. Run ensureSystemRolesAndPermissions() / seed first.`,
    );
  }
  return role.id;
}
