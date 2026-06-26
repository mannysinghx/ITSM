import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { systemRoleId } from "@/lib/bootstrap";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/validation";
import { seedTenantConfig } from "@/lib/tickets/config";
import { seedTenantSla } from "@/lib/sla/config";
import { ensureBilling } from "@/lib/billing/service";

export interface ProvisionResult {
  userId: string;
  tenantId: string;
  defaultTeamId: string;
}

/** Creates the global user row (or rejects a duplicate email). */
async function createUser(name: string, email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("EMAIL_TAKEN");
  return prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });
}

/**
 * Provisions a tenant + its default team(s) + owner membership/role atomically inside
 * ONE transaction with the tenant context set (ADR-2). If any step fails, the whole
 * tenant provisioning rolls back — no orphaned tenants. The tenant id is generated up
 * front so the RLS WITH CHECK (id = active tenant) passes on the very first INSERT.
 */
async function provisionTenant(opts: {
  userId: string;
  tenantName: string;
  type: "individual" | "company";
  teamNames: { name: string; isDefault: boolean }[];
}): Promise<{ tenantId: string; defaultTeamId: string }> {
  const tenantId = randomUUID();
  const ownerRoleId = await systemRoleId("owner");

  return withTenant(tenantId, opts.userId, async (tx) => {
    await tx.tenant.create({
      data: {
        id: tenantId,
        name: opts.tenantName,
        slug: slugify(opts.tenantName),
        type: opts.type,
        ownerUserId: opts.userId,
      },
    });

    await tx.tenantCounter.create({ data: { tenantId } });
    await ensureBilling(tx, tenantId);

    // Seed ticket config (statuses/types/priority matrix/categories) for this tenant.
    await seedTenantConfig(tx, tenantId);
    // Seed default SLA policies + business hours (calendar-time MVP, ADR-9).
    await seedTenantSla(tx, tenantId);

    await tx.tenantMembership.create({
      data: { tenantId, userId: opts.userId, status: "active" },
    });

    // Owner role at the tenant level (teamId null).
    await tx.userRoleAssignment.create({
      data: { tenantId, userId: opts.userId, roleId: ownerRoleId, teamId: null },
    });

    let defaultTeamId = "";
    for (const t of opts.teamNames) {
      const team = await tx.team.create({
        data: {
          tenantId,
          name: t.name,
          slug: slugify(t.name),
          isDefault: t.isDefault,
        },
      });
      if (t.isDefault) defaultTeamId = team.id;
      // Owner joins every default team, carrying the owner role.
      await tx.teamMembership.create({
        data: { tenantId, teamId: team.id, userId: opts.userId, roleId: ownerRoleId },
      });
    }

    await writeAudit(tx, {
      tenantId,
      actorId: opts.userId,
      action: "tenant.provisioned",
      entityType: "tenant",
      entityId: tenantId,
      metadata: { type: opts.type },
    });

    return { tenantId, defaultTeamId };
  });
}

/** Individual signup → individual tenant + single "Personal Workspace" team (spec §10.1). */
export async function provisionIndividual(input: {
  name: string;
  email: string;
  password: string;
}): Promise<ProvisionResult> {
  const user = await createUser(input.name, input.email, input.password);
  const { tenantId, defaultTeamId } = await provisionTenant({
    userId: user.id,
    tenantName: `${input.name}'s Workspace`,
    type: "individual",
    teamNames: [{ name: "Personal Workspace", isDefault: true }],
  });
  return { userId: user.id, tenantId, defaultTeamId };
}

/** Company signup → company tenant + IT Support (default) + General Requests (spec §10.1). */
export async function provisionCompany(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<ProvisionResult> {
  const user = await createUser(input.name, input.email, input.password);
  const { tenantId, defaultTeamId } = await provisionTenant({
    userId: user.id,
    tenantName: input.companyName,
    type: "company",
    teamNames: [
      { name: "IT Support", isDefault: true },
      { name: "General Requests", isDefault: false },
    ],
  });
  return { userId: user.id, tenantId, defaultTeamId };
}
