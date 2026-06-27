import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Single Prisma client. At runtime it connects as `flowdesk_app` (RLS-enforced);
 * in migrate/seed it connects as `flowdesk_migrator` — the difference is only which
 * DATABASE_URL is loaded. App code must NOT import this directly for tenant data;
 * use `withTenant` / `withUser` so the tenant context (ADR-2) is always set.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** A transaction-scoped Prisma client. Only these can touch tenant-owned tables. */
export type Tx = Prisma.TransactionClient;

interface Ctx {
  tenantId?: string;
  userId?: string;
}

/**
 * Opens a transaction, sets the tenant/user GUCs with `set_config(..., true)` so they
 * are LOCAL to the transaction and evaporate on commit/rollback — preventing the
 * connection-pool identity bleed that plain `SET` would cause (ADR-2).
 */
async function runWithContext<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      if (ctx.userId) {
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`;
      }
      if (ctx.tenantId) {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`;
      }
      return fn(tx);
    },
    // The per-transaction context model (ADR-2) means multi-step services run in one
    // transaction; the default 5s is tight on managed/networked Postgres. 15s ceiling.
    { timeout: 15_000, maxWait: 10_000 },
  );
}

/** Run tenant-scoped work. `tenantId` MUST come from the session, never from input. */
export function withTenant<T>(
  tenantId: string,
  userId: string | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return runWithContext({ tenantId, userId }, fn);
}

/**
 * Run user-scoped, pre-tenant work (login, tenant switcher): sets only the user GUC.
 * Used for the legitimate cross-tenant "which tenants am I in" lookup (ADR-2 escape hatch).
 */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runWithContext({ userId }, fn);
}
