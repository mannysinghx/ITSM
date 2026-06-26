import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions, systemRoleId } from "@/lib/bootstrap";
import { provisionIndividual, provisionCompany } from "@/lib/provisioning";
import { hashPassword } from "@/lib/auth/password";
import { slugify } from "@/lib/validation";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/authz";
import { createTicket, addComment } from "@/lib/tickets/service";
import { createForm, createCatalogItem } from "@/lib/admin/catalog";

/** Builds an owner-level AuthContext (all permissions) for seeding tickets. */
async function ownerCtx(tenantId: string, userId: string): Promise<AuthContext> {
  const teams = await withTenant(tenantId, userId, (tx) =>
    tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }),
  );
  return {
    userId,
    tenantId,
    teamIds: teams.map((t) => t.teamId),
    permissionKeys: new Set(PERMISSION_KEYS),
  };
}

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
  const ind = await provisionIndividual({
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

  console.log("Seeding demo tickets…");
  const acmeCtx = await ownerCtx(acme.tenantId, acme.userId);
  const emailOutage = await createTicket(acmeCtx, {
    title: "Company-wide email outage",
    description: "Users across all offices cannot send or receive email since 09:00.",
    type: "incident",
    teamId: itSupport.id,
    impact: "critical",
    urgency: "critical",
  });
  await addComment(acmeCtx, emailOutage.id, "Escalating to Microsoft 365 support.", true);
  await createTicket(acmeCtx, {
    title: "VPN access request for new contractor",
    description: "Please grant VPN access to contractor J. Doe for the duration of the project.",
    type: "access_request",
    teamId: itSupport.id,
    impact: "low",
    urgency: "medium",
  });
  await createTicket(acmeCtx, {
    title: "New laptop setup for employee",
    description: "Provision and configure a laptop for the new hire starting Monday.",
    type: "service_request",
    teamId: itSupport.id,
    impact: "medium",
    urgency: "medium",
  });
  await createTicket(acmeCtx, {
    title: "Phishing email reported by finance",
    description: "Suspicious email impersonating the CFO requesting a wire transfer.",
    type: "security_event",
    teamId: securityId,
    impact: "high",
    urgency: "high",
  });
  await createTicket(acmeCtx, {
    title: "Printer on 3rd floor not working",
    description: "The shared printer reports a paper jam that cannot be cleared.",
    type: "incident",
    teamId: itSupport.id,
    impact: "low",
    urgency: "low",
  });

  const indCtx = await ownerCtx(ind.tenantId, ind.userId);
  await createTicket(indCtx, {
    title: "Set up password manager",
    description: "Personal task: choose and configure a password manager.",
    type: "task",
    impact: "low",
    urgency: "low",
  });
  await createTicket(indCtx, {
    title: "Laptop battery draining fast",
    description: "Battery health degraded; investigate replacement options.",
    type: "incident",
    impact: "medium",
    urgency: "low",
  });

  console.log("Seeding service catalog…");
  const pwForm = await createForm(acmeCtx, "Password Reset Form", {
    fields: [
      { key: "username", label: "Username", type: "text", required: true },
      { key: "reason", label: "Reason", type: "textarea", required: false },
    ],
  });
  await createCatalogItem(acmeCtx, {
    name: "Reset Password",
    description: "Request a password reset for your account.",
    category: "Access",
    teamId: itSupport.id,
    formDefinitionId: pwForm.id,
    defaultPriority: "p3",
    visibility: "internal",
  });

  const laptopForm = await createForm(acmeCtx, "New Laptop Form", {
    fields: [
      { key: "model", label: "Preferred model", type: "dropdown", required: true, options: ["MacBook Pro", "ThinkPad", "Dell XPS"] },
      { key: "justification", label: "Business justification", type: "textarea", required: true },
    ],
  });
  await createCatalogItem(acmeCtx, {
    name: "Request New Laptop",
    description: "Order a new laptop (requires manager approval).",
    category: "Hardware",
    teamId: itSupport.id,
    formDefinitionId: laptopForm.id,
    defaultPriority: "p3",
    approvalRequired: true,
    approvalChain: [{ type: "team_manager" }],
    visibility: "internal",
  });

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
