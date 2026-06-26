import { createHash, randomBytes } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { type AuthContext, requirePermission, ForbiddenError } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";

function hashKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface KeyContext {
  apiKeyId: string;
  tenantId: string;
  scopes: string[];
}

/** Creates an API key. The raw token is returned ONCE; only its hash is stored. */
export async function createApiKey(ctx: AuthContext, name: string, scopes: string[], expiresAt?: Date) {
  requirePermission(ctx, "apikey.manage");
  const token = `fd_${randomBytes(24).toString("hex")}`;
  const prefix = token.slice(0, 10);
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const key = await tx.apiKey.create({
      data: {
        tenantId: ctx.tenantId, name, prefix, keyHash: hashKey(token),
        scopes, createdByUserId: ctx.userId, expiresAt: expiresAt ?? null,
      },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "apikey.created", entityType: "api_key", entityId: key.id, metadata: { name, scopes },
    });
    return { id: key.id, prefix, key: token }; // key shown once
  });
}

export async function listApiKeys(ctx: AuthContext) {
  requirePermission(ctx, "apikey.manage");
  // api_keys is a global table (not RLS) — scope by tenantId explicitly.
  return prisma.apiKey.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiKey(ctx: AuthContext, id: string) {
  requirePermission(ctx, "apikey.manage");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    // Global table — guard tenantId explicitly so a guessed id can't revoke another tenant's key.
    const key = await tx.apiKey.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!key) throw new NotFoundError("API key not found");
    await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "apikey.revoked", entityType: "api_key", entityId: id, metadata: {},
    });
    return { id };
  });
}

/** Verifies a raw token. Returns the key context, or null if unknown/revoked/expired. */
export async function verifyApiKey(token: string): Promise<KeyContext | null> {
  if (!token?.startsWith("fd_")) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(token) } });
  if (!key || key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { apiKeyId: key.id, tenantId: key.tenantId, scopes: key.scopes };
}

/** Throws unless the key holds the required scope (or the "*" wildcard). */
export function requireScope(keyCtx: KeyContext, scope: string): void {
  if (!keyCtx.scopes.includes(scope) && !keyCtx.scopes.includes("*")) {
    throw new ForbiddenError(`API key missing scope: ${scope}`);
  }
}

/** Append-only key-activity log (master spec §18.13). */
export async function logKeyActivity(
  keyCtx: KeyContext, route: string, method: string, status: number, ipAddress?: string,
) {
  await withTenant(keyCtx.tenantId, undefined, (tx) =>
    tx.apiKeyActivity.create({
      data: { tenantId: keyCtx.tenantId, apiKeyId: keyCtx.apiKeyId, route, method, status, ipAddress: ipAddress ?? null },
    }),
  ).catch(() => {});
}
