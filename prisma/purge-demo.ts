import { prisma } from "@/lib/db";

export const DEMO_EMAIL_DOMAIN = "@demospace.local";

/**
 * Deletes ONLY the demo space: tenants flagged `settings.demo = true` (cascades their
 * teams/tickets/etc.) and the demo users created for them (emails @demospace.local).
 * Real accounts are never touched. Must run as the owner/migrator role (it enumerates
 * tenants without a per-tenant RLS context — the role carries BYPASSRLS in production).
 */
export async function purgeDemo(): Promise<{ tenants: number; users: number }> {
  const demoTenants = await prisma.tenant.findMany({
    where: { settings: { path: ["demo"], equals: true } },
    select: { id: true },
  });
  if (demoTenants.length > 0) {
    await prisma.tenant.deleteMany({ where: { id: { in: demoTenants.map((t) => t.id) } } });
  }
  const users = await prisma.user.deleteMany({
    where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
  });
  return { tenants: demoTenants.length, users: users.count };
}

// Run standalone: `tsx prisma/purge-demo.ts` (with DATABASE_URL = owner/migrator role).
if (process.argv[1]?.endsWith("purge-demo.ts")) {
  purgeDemo()
    .then((r) => {
      console.log(`Demo space purged: ${r.tenants} tenant(s), ${r.users} user(s) removed.`);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
