import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { PERMISSIONS, PERMISSION_KEYS } from "@/lib/permissions";
import { slugify } from "@/lib/validation";

/** Lists system roles (tenantId null) + this tenant's custom roles, with permission keys. */
export async function listRoles(ctx: AuthContext) {
  requirePermission(ctx, "role.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const roles = await tx.role.findMany({
      where: { OR: [{ tenantId: null }, { tenantId: ctx.tenantId }] },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return roles.map((r) => ({
      id: r.id, key: r.key, name: r.name, description: r.description,
      isSystem: r.isSystem, scope: r.scope,
      permissions: r.permissions.map((p) => p.permission.key),
    }));
  });
}

export function listPermissions() {
  return PERMISSIONS;
}

function validKeys(keys: string[]): string[] {
  const valid = keys.filter((k) => PERMISSION_KEYS.includes(k));
  if (valid.length === 0) throw new ValidationError("No valid permissions provided");
  return valid;
}

async function setRolePermissions(
  tx: Parameters<Parameters<typeof withTenant>[2]>[0],
  roleId: string,
  keys: string[],
) {
  const perms = await tx.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true },
  });
  await tx.rolePermission.deleteMany({ where: { roleId } });
  await tx.rolePermission.createMany({
    data: perms.map((p) => ({ roleId, permissionId: p.id })),
    skipDuplicates: true,
  });
}

export async function createRole(
  ctx: AuthContext,
  input: { name: string; permissionKeys: string[] },
) {
  requirePermission(ctx, "role.manage");
  const keys = validKeys(input.permissionKeys);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const role = await tx.role.create({
      data: {
        tenantId: ctx.tenantId,
        key: slugify(input.name),
        name: input.name,
        scope: "tenant",
        isSystem: false,
      },
    });
    await setRolePermissions(tx, role.id, keys);
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "role.created", entityType: "role", entityId: role.id,
      metadata: { name: input.name, permissions: keys },
    });
    return { id: role.id };
  });
}

/** Clones any visible role's permissions into a new custom role. */
export async function cloneRole(ctx: AuthContext, sourceRoleId: string, newName: string) {
  requirePermission(ctx, "role.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const source = await tx.role.findFirst({
      where: { id: sourceRoleId, OR: [{ tenantId: null }, { tenantId: ctx.tenantId }] },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!source) throw new NotFoundError("Source role not found");
    const role = await tx.role.create({
      data: { tenantId: ctx.tenantId, key: slugify(newName), name: newName, scope: "tenant", isSystem: false },
    });
    await setRolePermissions(tx, role.id, source.permissions.map((p) => p.permission.key));
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "role.cloned", entityType: "role", entityId: role.id,
      metadata: { from: sourceRoleId, name: newName },
    });
    return { id: role.id };
  });
}

export async function updateRole(
  ctx: AuthContext,
  roleId: string,
  patch: { name?: string; permissionKeys?: string[] },
) {
  requirePermission(ctx, "role.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const role = await tx.role.findFirst({ where: { id: roleId } });
    if (!role) throw new NotFoundError("Role not found");
    // Only this tenant's custom roles are editable — never system roles or other tenants'.
    if (role.isSystem || role.tenantId !== ctx.tenantId) {
      throw new ValidationError("System roles cannot be edited");
    }
    if (patch.name) {
      await tx.role.update({ where: { id: roleId }, data: { name: patch.name } });
    }
    if (patch.permissionKeys) {
      await setRolePermissions(tx, roleId, validKeys(patch.permissionKeys));
    }
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "role.updated", entityType: "role", entityId: roleId, metadata: { ...patch },
    });
    return { id: roleId };
  });
}
