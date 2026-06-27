/**
 * Fills the existing "sample" accounts (created via signup, currently empty) with the
 * same rich demo dataset, so logging into them shows full pages. These are NOT part of
 * the demo space (`pnpm demo:purge` leaves them alone). Idempotent: skips accounts that
 * already have data. Sub-users use a separate @flowdeskfill.local domain so the demo
 * purge never touches them.
 *
 *   tsx prisma/fill-accounts.ts   (with DATABASE_URL = owner/migrator role)
 */
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { populateCompany, populatePersonal } from "./seed-demo";

const FILL_DOMAIN = "@flowdeskfill.local";

interface OwnerRef { userId: string; tenantId: string; defaultTeamId: string; type: string }

async function findOwner(email: string): Promise<OwnerRef | null> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return null;
  // The owner role carries BYPASSRLS in prod, so this enumerates without a tenant context.
  const tenant = await prisma.tenant.findFirst({ where: { ownerUserId: user.id }, select: { id: true, type: true } });
  if (!tenant) return null;
  const team = await withTenant(tenant.id, user.id, (tx) =>
    tx.team.findFirst({ where: { tenantId: tenant.id, isDefault: true }, select: { id: true } }),
  ) ?? await withTenant(tenant.id, user.id, (tx) =>
    tx.team.findFirst({ where: { tenantId: tenant.id }, select: { id: true } }),
  );
  return { userId: user.id, tenantId: tenant.id, defaultTeamId: team?.id ?? "", type: tenant.type };
}

async function ticketCount(owner: OwnerRef): Promise<number> {
  return withTenant(owner.tenantId, owner.userId, (tx) => tx.ticket.count({ where: { tenantId: owner.tenantId } }));
}

async function main() {
  await ensureSystemRolesAndPermissions();

  const targets = [
    { email: "admin@demo.flowdesk.app", kind: "company", label: "FlowDesk Demo Co", tag: ".fdc" },
    { email: "company@demo.flowdesk.app", kind: "company", label: "Sample Company Ltd", tag: ".scl" },
    { email: "individual@demo.flowdesk.app", kind: "individual" },
  ] as const;

  for (const t of targets) {
    const owner = await findOwner(t.email);
    if (!owner) { console.log(`• ${t.email}: not found — skipping`); continue; }
    const existing = await ticketCount(owner);
    if (existing > 5) { console.log(`• ${t.email}: already has ${existing} tickets — skipping`); continue; }

    console.log(`• Filling ${t.email} (${t.kind})…`);
    if (t.kind === "company") {
      await populateCompany(owner, t.label, false, t.tag, FILL_DOMAIN);
    } else {
      await populatePersonal(owner, false);
    }
    console.log(`  ✓ ${t.email} filled.`);
  }
  console.log("\nDone. These sample accounts now have data (password: as you set at signup).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
