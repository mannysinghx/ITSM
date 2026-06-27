import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions, systemRoleId } from "@/lib/bootstrap";
import { provisionIndividual, provisionCompany } from "@/lib/provisioning";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { PLAN_LIMITS } from "@/lib/billing/service";
import type { AuthContext } from "@/lib/authz";
import type { Severity } from "@prisma/client";
import {
  createTicket, assignTicket, changeStatus, addComment, type CreateTicketInput,
} from "@/lib/tickets/service";
import { createTask } from "@/lib/tasks/service";
import { purgeDemo, DEMO_EMAIL_DOMAIN } from "./purge-demo";

const DEMO_PW = "DemoSpace2026!";
const COMPANY_TICKETS = 100;
const INDIV_TICKETS = 60;
const INDIV_TASKS = 40;

const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const TYPES = ["incident", "service_request", "question", "access_request", "problem", "change", "alert", "task"];
const TAGS = ["vpn", "email", "laptop", "network", "printer", "access", "outage", "billing", "onboarding", "security"];

const TITLES = [
  "Cannot connect to VPN", "Email not syncing on mobile", "Laptop won't power on",
  "Request access to shared drive", "Printer on 4th floor jammed", "Password reset needed",
  "Slow network in conference room", "New hire onboarding setup", "Software license expired",
  "MFA device lost", "Outlook crashes on launch", "Request new monitor",
  "Phishing email reported", "Wi-Fi keeps dropping", "Disk almost full on workstation",
  "Cannot access CRM", "VPN slow from home", "Request admin rights for tool",
  "Zoom audio not working", "Shared mailbox permissions", "Server high CPU alert",
  "Database connection timeouts", "Offboarding departing employee", "Replace failing hard drive",
  "Two-factor not prompting", "Guest Wi-Fi access request", "Application error on save",
  "Need software installed", "Account locked out", "Slow file server access",
];
const DESCRIPTIONS = [
  "Started this morning and is blocking my work. Please advise.",
  "Tried restarting but the issue persists. Screenshot attached.",
  "Affecting several people on my team. Fairly urgent.",
  "Low priority but would appreciate a fix when possible.",
  "Happens intermittently, hard to reproduce reliably.",
  "Worked fine yesterday, broke after the latest update.",
];
const COMMENTS = [
  "Thanks for reaching out — taking a look now.", "Could you confirm your device name?",
  "We've reproduced this and are working on a fix.", "Please try again and let us know.",
  "Escalating to the network team.", "Resolved on our end — closing out.",
];
const NOTES = [
  "Likely a config drift after the patch window.", "Checked logs — auth service flapping.",
  "Vendor ticket opened, awaiting response.", "Assigned to on-call for follow-up.",
];

function ctxOf(userId: string, tenantId: string, teamIds: string[]): AuthContext {
  return { userId, tenantId, teamIds, permissionKeys: new Set(PERMISSION_KEYS) };
}

/** Flags a tenant as demo-only and lifts plan limits so demos aren't capped. */
async function markDemo(tenantId: string, ownerId: string, label: string) {
  await withTenant(tenantId, ownerId, async (tx) => {
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = { ...((t?.settings as object) ?? {}), demo: true, demoSpace: "demo", demoLabel: label };
    await tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } });
    await tx.billingAccount.update({
      where: { tenantId }, data: { plan: "enterprise", limits: PLAN_LIMITS.enterprise as object },
    });
  });
}

async function makeDemoUser(tenantId: string, name: string, email: string, teamId: string, roleKey: string) {
  const roleId = await systemRoleId(roleKey);
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(DEMO_PW) },
  });
  await withTenant(tenantId, user.id, async (tx) => {
    await tx.tenantMembership.create({ data: { tenantId, userId: user.id, status: "active" } });
    await tx.userRoleAssignment.create({ data: { tenantId, userId: user.id, roleId, teamId } });
    await tx.teamMembership.create({ data: { tenantId, teamId, userId: user.id, roleId } });
  });
  return user.id;
}

/** Creates one ticket with realistic variety, then optionally assigns / advances / comments. */
async function makeTicket(
  requester: AuthContext, teamId: string, agentIds: string[], categoryIds: string[],
) {
  const input: CreateTicketInput = {
    title: rand(TITLES),
    description: rand(DESCRIPTIONS),
    type: rand(TYPES),
    teamId,
    impact: rand(SEVERITIES),
    urgency: rand(SEVERITIES),
    categoryId: chance(0.6) ? rand(categoryIds) : undefined,
    tags: chance(0.5) ? [rand(TAGS), rand(TAGS)] : [],
  };
  const ticket = await createTicket(requester, input, { allowAnyTeam: true });
  const actor = requester; // has full perms in this tenant

  if (agentIds.length && chance(0.6)) {
    await assignTicket(actor, ticket.id, rand(agentIds));
  }
  if (chance(0.45)) {
    await changeStatus(actor, ticket.id, rand(["triaged", "in_progress", "waiting_on_requester"]));
  } else if (chance(0.3)) {
    await changeStatus(actor, ticket.id, rand(["resolved", "closed"]));
  }
  if (chance(0.35)) await addComment(actor, ticket.id, rand(COMMENTS), false);
  if (chance(0.2)) await addComment(actor, ticket.id, rand(NOTES), true);
  return ticket.id;
}

/** Runs an array of async thunks in small concurrent batches (kinder to the DB pool). */
async function inBatches<T>(items: (() => Promise<T>)[], size = 5) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map((fn) => fn()));
    process.stdout.write(`\r   …${Math.min(i + size, items.length)}/${items.length}`);
  }
  process.stdout.write("\n");
}

async function seedDemoCompany() {
  console.log("Creating DEMO company tenant…");
  const owner = await provisionCompany({
    name: "Demo Admin", companyName: "Globex Demo Corp",
    email: `owner${DEMO_EMAIL_DOMAIN}`, password: DEMO_PW,
  });
  await markDemo(owner.tenantId, owner.userId, "Globex Demo Corp");

  // Owner teams + two extra teams.
  const teams = await withTenant(owner.tenantId, owner.userId, async (tx) => {
    for (const name of ["Security", "Facilities"]) {
      await tx.team.create({ data: { tenantId: owner.tenantId, name, slug: `${name.toLowerCase()}-demo` } });
    }
    return tx.team.findMany({ select: { id: true, name: true } });
  });
  const categoryIds = await withTenant(owner.tenantId, owner.userId, (tx) =>
    tx.category.findMany({ select: { id: true } }),
  ).then((c) => c.map((x) => x.id));
  const itSupport = teams.find((t) => t.name === "IT Support")!.id;

  // Demo users across teams.
  console.log("Adding demo users…");
  const userDefs = [
    ["Ivy Manager", "manager", itSupport, "team_manager"],
    ["Alex Agent", "agent1", itSupport, "agent"],
    ["Sam Agent", "agent2", itSupport, "agent"],
    ["Sec Lead", "seclead", teams.find((t) => t.name === "Security")!.id, "team_manager"],
    ["Sec Analyst", "secanalyst", teams.find((t) => t.name === "Security")!.id, "agent"],
    ["Fac Tech", "factech", teams.find((t) => t.name === "Facilities")!.id, "agent"],
    ["Riley Requester", "req1", itSupport, "requester"],
    ["Jordan Requester", "req2", itSupport, "requester"],
  ] as const;
  const userIds: string[] = [];
  for (const [name, local, teamId, role] of userDefs) {
    userIds.push(await makeDemoUser(owner.tenantId, name, `${local}${DEMO_EMAIL_DOMAIN}`, teamId, role));
  }
  // Requester pool = owner + the two requesters + everyone (all have full seed perms).
  const requesterCtxs = [owner.userId, ...userIds].map((uid) =>
    ctxOf(uid, owner.tenantId, teams.map((t) => t.id)),
  );
  const agentIds = userIds.slice(0, 6); // managers + agents

  console.log(`Generating ${COMPANY_TICKETS} demo tickets…`);
  // Sequential: parallel creates contend on the per-tenant ticket-number counter row.
  await inBatches(
    Array.from({ length: COMPANY_TICKETS }, () => () =>
      makeTicket(rand(requesterCtxs), rand(teams).id, agentIds, categoryIds),
    ),
    1,
  );
  return owner;
}

async function seedDemoIndividual() {
  console.log("Creating DEMO individual tenant…");
  const ind = await provisionIndividual({
    name: "Demo Individual", email: `individual${DEMO_EMAIL_DOMAIN}`, password: DEMO_PW,
  });
  await markDemo(ind.tenantId, ind.userId, "Demo Individual Workspace");
  const ctx = ctxOf(ind.userId, ind.tenantId, [ind.defaultTeamId]);
  const categoryIds = await withTenant(ind.tenantId, ind.userId, (tx) =>
    tx.category.findMany({ select: { id: true } }),
  ).then((c) => c.map((x) => x.id));

  console.log(`Generating ${INDIV_TICKETS} personal tickets…`);
  await inBatches(
    Array.from({ length: INDIV_TICKETS }, () => () =>
      makeTicket(ctx, ind.defaultTeamId, [], categoryIds),
    ),
    1,
  );

  console.log(`Generating ${INDIV_TASKS} personal tasks…`);
  await inBatches(
    Array.from({ length: INDIV_TASKS }, () => async () => {
      await createTask(ctx, {
        title: rand(TITLES), teamId: ind.defaultTeamId,
        priority: rand(["p1", "p2", "p3", "p4"]) as "p1" | "p2" | "p3" | "p4",
      });
    }),
    5,
  );
  return ind;
}

async function main() {
  await ensureSystemRolesAndPermissions();
  console.log("Purging any existing demo space…");
  const purged = await purgeDemo();
  console.log(`  removed ${purged.tenants} tenant(s), ${purged.users} user(s).`);

  await seedDemoCompany();
  await seedDemoIndividual();

  console.log("\n✓ Demo space ready (flagged settings.demo=true). Logins (password: " + DEMO_PW + "):");
  console.log(`  owner${DEMO_EMAIL_DOMAIN}        — Globex Demo Corp (admin)`);
  console.log(`  manager${DEMO_EMAIL_DOMAIN}      — IT Support manager`);
  console.log(`  agent1${DEMO_EMAIL_DOMAIN}       — IT Support agent`);
  console.log(`  req1${DEMO_EMAIL_DOMAIN}         — requester`);
  console.log(`  individual${DEMO_EMAIL_DOMAIN}   — personal workspace`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
