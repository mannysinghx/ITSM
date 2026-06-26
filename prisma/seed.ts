import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions, systemRoleId } from "@/lib/bootstrap";
import { provisionIndividual, provisionCompany } from "@/lib/provisioning";
import { hashPassword } from "@/lib/auth/password";
import { slugify } from "@/lib/validation";

/** Adds a user to a tenant + team with a system role (demo data). */
async function addMember(
  tenantId: string,
  user: { name: string; email: string; password: string },
  teamId: string,
  roleKey: string,
) {
  const roleId = await systemRoleId(roleKey);
  const created = await prisma.user.create({
    data: { name: user.name, email: user.email, passwordHash: await hashPassword(user.password) },
  });
  await withTenant(tenantId, created.id, async (tx) => {
    await tx.tenantMembership.create({ data: { tenantId, userId: created.id, status: "active" } });
    await tx.userRoleAssignment.create({ data: { tenantId, userId: created.id, roleId, teamId } });
    await tx.teamMembership.create({ data: { tenantId, teamId, userId: created.id, roleId } });
  });
  return created.id;
}

async function extraTeam(tenantId: string, ownerId: string, name: string) {
  return withTenant(tenantId, ownerId, async (tx) => {
    const team = await tx.team.create({
      data: { tenantId, name, slug: slugify(name) },
    });
    return team.id;
  });
}

async function main() {
  console.log("Resetting demo data…");
  // TRUNCATE bypasses RLS (it is not a DML policy target); safe as the owner role.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE tenants, users RESTART IDENTITY CASCADE;`,
  );

  console.log("Seeding permissions + system roles…");
  await ensureSystemRolesAndPermissions();

  console.log("Seeding individual demo tenant…");
  await provisionIndividual({
    name: "Demo Individual",
    email: "individual@example.com",
    password: "password123",
  });

  console.log("Seeding Acme Corp…");
  const acme = await provisionCompany({
    name: "Acme Admin",
    email: "admin@acme.test",
    companyName: "Acme Corp",
    password: "password123",
  });

  // Locate provisioned teams + add Security / Facilities.
  const teams = await withTenant(acme.tenantId, acme.userId, (tx) =>
    tx.team.findMany({ select: { id: true, name: true } }),
  );
  const itSupport = teams.find((t) => t.name === "IT Support")!;
  const securityId = await extraTeam(acme.tenantId, acme.userId, "Security");
  await extraTeam(acme.tenantId, acme.userId, "Facilities");

  await addMember(
    acme.tenantId,
    { name: "Ivy Manager", email: "it.manager@acme.test", password: "password123" },
    itSupport.id,
    "team_manager",
  );
  await addMember(
    acme.tenantId,
    { name: "Alex Agent", email: "it.agent@acme.test", password: "password123" },
    itSupport.id,
    "agent",
  );
  await addMember(
    acme.tenantId,
    { name: "Sam SecOps", email: "sec.agent@acme.test", password: "password123" },
    securityId,
    "agent",
  );
  await addMember(
    acme.tenantId,
    { name: "Riley Requester", email: "requester@acme.test", password: "password123" },
    itSupport.id,
    "requester",
  );

  console.log("\nSeed complete. Demo logins (password: password123):");
  console.log("  individual@example.com   (individual owner)");
  console.log("  admin@acme.test          (Acme owner/admin)");
  console.log("  it.manager@acme.test     (IT Support manager)");
  console.log("  it.agent@acme.test       (IT Support agent)");
  console.log("  sec.agent@acme.test      (Security agent)");
  console.log("  requester@acme.test      (requester)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
