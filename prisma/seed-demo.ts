import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions, systemRoleId } from "@/lib/bootstrap";
import { provisionIndividual, provisionCompany } from "@/lib/provisioning";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { PLAN_LIMITS } from "@/lib/billing/service";
import type { AuthContext } from "@/lib/authz";
import type { Severity } from "@prisma/client";
import { createTicket, assignTicket, changeStatus, addComment } from "@/lib/tickets/service";
import { createTask } from "@/lib/tasks/service";
import { createForm, createCatalogItem } from "@/lib/admin/catalog";
import { submitCatalog } from "@/lib/catalog/service";
import { decideApproval } from "@/lib/catalog/approvals";
import { createArticle } from "@/lib/knowledge/service";
import { createRule } from "@/lib/admin/automation";
import { createIntegration, createWebhook } from "@/lib/admin/integrations";
import { createApiKey } from "@/lib/integrations/apikeys";
import { classifyTicket, summarizeTicket, generateKnowledgeArticle } from "@/lib/ai/service";
import { purgeDemo, DEMO_EMAIL_DOMAIN } from "./purge-demo";

const DEMO_PW = "DemoSpace2026!";
const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;
const sample = <T,>(a: T[], n: number): T[] => [...a].sort(() => Math.random() - 0.5).slice(0, n);

const SEV: Severity[] = ["low", "medium", "high", "critical"];

// --- realistic content pools, loosely grouped by type ---
const TICKETS_BY_TYPE: Record<string, string[]> = {
  incident: [
    "VPN disconnects every few minutes", "Outlook crashes when opening attachments",
    "Shared drive is inaccessible", "Printer on 4th floor shows paper jam",
    "Wi-Fi keeps dropping in the east wing", "Production API returning 502 errors",
    "Email delivery delayed by several hours", "Workstation blue-screens on startup",
    "CRM dashboard not loading", "Phone system dropping calls",
  ],
  service_request: [
    "Request a second monitor", "New laptop for incoming hire", "Install Adobe Creative Cloud",
    "Set up a shared mailbox for the team", "Provision a standing desk", "Upgrade RAM on workstation",
    "Request a docking station", "Set up conference room display",
  ],
  access_request: [
    "Access to the finance shared folder", "Admin rights for the analytics tool",
    "VPN access for a new contractor", "Add me to the engineering Slack channels",
    "Database read access for reporting", "GitHub access for the new repo",
  ],
  problem: ["Recurring DNS resolution failures", "Intermittent SSO login loops", "Repeated disk-space alerts on app servers"],
  change: ["Schedule firewall rule update", "Migrate mailboxes to the new tenant", "Roll out OS patch to all laptops"],
  question: ["How do I set up MFA?", "Where do I find my pay stubs?", "How to request time off in the portal?"],
  security_event: ["Phishing email reported by finance", "Suspicious login from unknown location", "Malware flagged on a workstation"],
  alert: ["High CPU on database primary", "SSL certificate expiring in 7 days", "Backup job failed overnight"],
};
const ALL_TYPES = Object.keys(TICKETS_BY_TYPE);
const DESCRIPTIONS = [
  "This started this morning and is blocking my work — any help appreciated.",
  "I've tried restarting but the problem persists. Screenshot attached.",
  "Several colleagues are affected, so this is fairly time-sensitive.",
  "Low priority, but would be great to sort out when someone has a moment.",
  "Happens intermittently and is hard to reproduce reliably.",
  "Worked fine until the update yesterday, then broke.",
];
const REPLIES = [
  "Thanks for flagging — I'm looking into it now.", "Could you confirm the device name or asset tag?",
  "We've reproduced this and a fix is on the way.", "Please try again now and let me know.",
  "I've escalated this to the network team.", "Marking this resolved — reach out if it recurs.",
  "Can you send a screenshot of the error?", "This should be fixed after the next sync.",
];
const NOTES = [
  "Root cause looks like config drift after the patch window.", "Auth service was flapping in the logs.",
  "Opened a vendor ticket; awaiting their response.", "Handed to on-call for overnight follow-up.",
  "Known issue — see KB article on VPN troubleshooting.",
];
const TAGS = ["vpn", "email", "laptop", "network", "printer", "access", "outage", "onboarding", "security", "hardware"];
const TASKS = [
  "Confirm manager approval", "Create user account", "Image and assign laptop", "Install required software",
  "Configure VPN profile", "Ship hardware to employee", "Verify first login", "Archive mailbox",
  "Revoke access on offboarding", "Order replacement part", "Schedule maintenance window", "Update asset record",
];

function ctxOf(userId: string, tenantId: string, teamIds: string[]): AuthContext {
  return { userId, tenantId, teamIds, permissionKeys: new Set(PERMISSION_KEYS) };
}

async function markDemo(tenantId: string, ownerId: string, label: string) {
  await withTenant(tenantId, ownerId, async (tx) => {
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    await tx.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...((t?.settings as object) ?? {}), demo: true, demoSpace: "demo", demoLabel: label } as object },
    });
    await tx.billingAccount.update({ where: { tenantId }, data: { plan: "enterprise", limits: PLAN_LIMITS.enterprise as object } });
  });
}

async function makeUser(tenantId: string, name: string, local: string, teamId: string, roleKey: string, domain = DEMO_EMAIL_DOMAIN) {
  const roleId = await systemRoleId(roleKey);
  const user = await prisma.user.create({ data: { name, email: `${local}${domain}`, passwordHash: await hashPassword(DEMO_PW) } });
  await withTenant(tenantId, user.id, async (tx) => {
    await tx.tenantMembership.create({ data: { tenantId, userId: user.id, status: "active" } });
    await tx.userRoleAssignment.create({ data: { tenantId, userId: user.id, roleId, teamId } });
    await tx.teamMembership.create({ data: { tenantId, teamId, userId: user.id, roleId } });
  });
  return user.id;
}

async function makeTicket(
  requester: AuthContext, teamId: string, agentIds: string[], categoryIds: string[], typeKey?: string,
) {
  const type = typeKey ?? rand(ALL_TYPES);
  const ticket = await createTicket(requester, {
    title: rand(TICKETS_BY_TYPE[type]), description: rand(DESCRIPTIONS), type, teamId,
    impact: rand(SEV), urgency: rand(SEV),
    categoryId: chance(0.6) && categoryIds.length ? rand(categoryIds) : undefined,
    tags: chance(0.5) ? sample(TAGS, 2) : [],
  }, { allowAnyTeam: true });

  if (agentIds.length && chance(0.7)) await assignTicket(requester, ticket.id, rand(agentIds));
  if (chance(0.4)) await changeStatus(requester, ticket.id, rand(["triaged", "in_progress", "waiting_on_requester"]));
  else if (chance(0.3)) await changeStatus(requester, ticket.id, rand(["resolved", "closed"]));
  if (chance(0.5)) await addComment(requester, ticket.id, rand(REPLIES), false);
  if (chance(0.3)) await addComment(requester, ticket.id, rand(NOTES), true);
  return ticket.id;
}

async function progress<T>(label: string, items: (() => Promise<T>)[]) {
  process.stdout.write(`   ${label}: `);
  for (let i = 0; i < items.length; i++) {
    await items[i]();
    if ((i + 1) % 5 === 0 || i === items.length - 1) process.stdout.write(`${i + 1} `);
  }
  process.stdout.write("\n");
}

/** Fills an existing company tenant with a complete demo dataset. `tag` namespaces the
 *  generated sub-user emails so the same dataset can be applied to multiple companies. */
export async function populateCompany(
  owner: { tenantId: string; userId: string; defaultTeamId: string },
  label: string, markAsDemo: boolean, tag: string, userDomain = DEMO_EMAIL_DOMAIN,
) {
  if (markAsDemo) await markDemo(owner.tenantId, owner.userId, label);
  else await liftPlan(owner.tenantId, owner.userId);
  const T = owner.tenantId;

  const teams = await withTenant(T, owner.userId, async (tx) => {
    await tx.team.createMany({ data: ["Security", "Facilities"].map((n) => ({ tenantId: T, name: n, slug: `${n.toLowerCase()}-demo` })), skipDuplicates: true });
    return tx.team.findMany({ where: { tenantId: T }, select: { id: true, name: true } });
  });
  const teamId = (n: string) => teams.find((t) => t.name === n)!.id;
  const allTeamIds = teams.map((t) => t.id);
  const categoryIds = await withTenant(T, owner.userId, (tx) => tx.category.findMany({ where: { tenantId: T }, select: { id: true } })).then((c) => c.map((x) => x.id));

  console.log("Adding users (managers, agents, requesters)…");
  const mk = (name: string, local: string, tId: string, role: string) => makeUser(T, name, `${local}${tag}`, tId, role, userDomain);
  const itManager = await mk("Ivy Chen", "ivy.manager", teamId("IT Support"), "team_manager");
  const secManager = await mk("Marcus Webb", "marcus.security", teamId("Security"), "team_manager");
  const agents = [
    await mk("Alex Rivera", "alex.agent", teamId("IT Support"), "agent"),
    await mk("Sam Patel", "sam.agent", teamId("IT Support"), "agent"),
    await mk("Dana Kim", "dana.agent", teamId("IT Support"), "agent"),
    await mk("Priya Singh", "priya.security", teamId("Security"), "agent"),
    await mk("Tom Fischer", "tom.facilities", teamId("Facilities"), "agent"),
  ];
  const requesters = [
    await mk("Riley Brooks", "riley", teamId("General Requests"), "requester"),
    await mk("Jordan Lee", "jordan", teamId("General Requests"), "requester"),
    await mk("Casey Morgan", "casey", teamId("General Requests"), "requester"),
    await mk("Avery Nguyen", "avery", teamId("General Requests"), "requester"),
  ];
  const ownerCtx = ctxOf(owner.userId, T, allTeamIds);
  const itMgrCtx = ctxOf(itManager, T, allTeamIds);
  const reqCtxs = requesters.map((u) => ctxOf(u, T, allTeamIds));
  const agentIds = [itManager, secManager, ...agents];

  console.log("Building service catalog…");
  const pwForm = await createForm(ownerCtx, "Password Reset", { fields: [{ key: "username", label: "Username", type: "text", required: true }, { key: "reason", label: "Reason", type: "textarea", required: false }] });
  const laptopForm = await createForm(ownerCtx, "New Laptop", { fields: [{ key: "model", label: "Model", type: "dropdown", required: true, options: ["MacBook Pro 14\"", "ThinkPad X1", "Dell XPS 15"] }, { key: "justification", label: "Business justification", type: "textarea", required: true }] });
  const accessForm = await createForm(ownerCtx, "System Access", { fields: [{ key: "system", label: "System", type: "dropdown", required: true, options: ["CRM", "Finance", "Analytics", "GitHub"] }, { key: "level", label: "Access level", type: "dropdown", required: true, options: ["Read", "Write", "Admin"] }] });
  const onboardForm = await createForm(ownerCtx, "Onboarding", { fields: [{ key: "employee", label: "Employee name", type: "text", required: true }, { key: "startDate", label: "Start date", type: "date", required: true }, { key: "role", label: "Role", type: "text", required: true }] });

  const catalog = {
    resetPw: (await createCatalogItem(ownerCtx, { name: "Reset Password", description: "Reset your account password.", category: "Access", teamId: teamId("IT Support"), formDefinitionId: pwForm.id, defaultPriority: "p3", visibility: "internal" })).id,
    laptop: (await createCatalogItem(ownerCtx, { name: "Request New Laptop", description: "Order a new laptop (manager approval required).", category: "Hardware", teamId: teamId("IT Support"), formDefinitionId: laptopForm.id, defaultPriority: "p3", approvalRequired: true, approvalChain: [{ type: "team_manager" }], visibility: "internal" })).id,
    access: (await createCatalogItem(ownerCtx, { name: "Request System Access", description: "Request access to an internal system (approval required).", category: "Access", teamId: teamId("IT Support"), formDefinitionId: accessForm.id, defaultPriority: "p2", approvalRequired: true, approvalChain: [{ type: "team_manager" }], visibility: "internal" })).id,
    onboard: (await createCatalogItem(ownerCtx, { name: "Employee Onboarding", description: "Kick off onboarding for a new hire.", category: "Onboarding", teamId: teamId("IT Support"), formDefinitionId: onboardForm.id, defaultPriority: "p2", approvalRequired: true, approvalChain: [{ type: "team_manager" }], visibility: "internal" })).id,
  };
  await createCatalogItem(ownerCtx, { name: "Install Software", description: "Request installation of approved software.", category: "Software", teamId: teamId("IT Support"), formDefinitionId: pwForm.id, defaultPriority: "p3", visibility: "internal" });
  await createCatalogItem(ownerCtx, { name: "Report a Security Concern", description: "Report phishing or suspicious activity.", category: "Security", teamId: teamId("Security"), formDefinitionId: pwForm.id, defaultPriority: "p1", visibility: "public" });
  await createCatalogItem(ownerCtx, { name: "Facilities Request", description: "Desk, badge, or building requests.", category: "Facilities", teamId: teamId("Facilities"), formDefinitionId: pwForm.id, defaultPriority: "p4", visibility: "internal" });

  console.log("Writing knowledge base…");
  const ARTICLES: [string, string][] = [
    ["How to connect to the VPN", "## Overview\nStep-by-step guide to connecting to the corporate VPN.\n\n## Steps\n1. Install the VPN client.\n2. Enter the server address.\n3. Authenticate with MFA.\n4. Confirm the connection indicator is green."],
    ["Reset your password", "## Self-service reset\n1. Go to the portal.\n2. Click 'Forgot password'.\n3. Follow the email link.\n\nIf locked out, submit a Reset Password request in the catalog."],
    ["Setting up email on mobile", "## iOS & Android\nUse the company mail app and sign in with SSO. Enable MFA when prompted."],
    ["Printer troubleshooting", "## Common fixes\n- Clear the paper tray.\n- Restart the printer.\n- Re-add the printer queue.\n- If jammed, open the rear panel and remove debris."],
    ["New employee onboarding checklist", "## Day one\n- Account created\n- Laptop assigned\n- Software installed\n- VPN configured\n- Building access granted"],
    ["Requesting software", "Submit an 'Install Software' request from the Service Catalog. Approved titles are installed within one business day."],
    ["Phishing: how to spot and report", "## Red flags\n- Urgent tone\n- Unexpected attachments\n- Mismatched sender domains\n\nReport via 'Report a Security Concern' in the catalog."],
    ["MFA enrolment guide", "## Enrol\n1. Open Settings → Security.\n2. Scan the QR code with your authenticator app.\n3. Save your recovery codes."],
    ["VPN keeps disconnecting", "## Troubleshooting\n- Switch to a wired connection.\n- Update the VPN client.\n- Check for ISP packet loss.\n- Contact IT if it persists."],
    ["Offboarding procedure", "## On departure\n- Disable accounts\n- Revoke access\n- Collect hardware\n- Archive mailbox"],
  ];
  for (const [title, body] of ARTICLES) await createArticle(ownerCtx, { title, body, status: "published", source: "human" });

  console.log("Configuring integrations + API key…");
  await createIntegration(ownerCtx, { kind: "slack", name: "Ops Slack", config: { channel: "#it-support" } });
  await createIntegration(ownerCtx, { kind: "teams", name: "Security Teams", config: { channel: "SecOps" } });
  await createIntegration(ownerCtx, { kind: "email", name: "Support Inbox", config: { mailbox: "support@globex-demo.test" } });
  await createWebhook(ownerCtx, { url: "https://hooks.globex-demo.test/itsm", events: ["ticket.created", "ticket.status_changed"] });
  await createApiKey(ownerCtx, "Reporting integration", ["ticket.read", "report.view"]);

  console.log("Generating tickets (distributed across requesters + agents)…");
  await progress("tickets", Array.from({ length: 80 }, () => () =>
    makeTicket(rand([ownerCtx, ...reqCtxs]), rand(teams).id, agentIds, categoryIds),
  ));

  console.log("Generating tasks (linked + standalone, assigned to agents)…");
  const ticketIds = await withTenant(T, owner.userId, (tx) => tx.ticket.findMany({ where: { tenantId: T }, select: { id: true }, take: 30 })).then((r) => r.map((x) => x.id));
  await progress("tasks", Array.from({ length: 35 }, (_, i) => async () => {
    await createTask(ownerCtx, {
      title: rand(TASKS), teamId: rand(allTeamIds),
      ticketId: i < 20 ? rand(ticketIds) : undefined,
      assigneeId: rand(agentIds), priority: rand(["p2", "p3", "p4"]) as "p2" | "p3" | "p4",
      dueAt: new Date(Date.now() + (1 + Math.floor(Math.random() * 14)) * 86400000).toISOString(),
    });
  }));

  console.log("Running AI assist (mock) + knowledge drafts…");
  for (const tid of sample(ticketIds, 8)) { await summarizeTicket(ownerCtx, { ticketId: tid }); if (chance(0.5)) await classifyTicket(ownerCtx, { ticketId: tid }); }
  for (const tid of sample(ticketIds, 2)) await generateKnowledgeArticle(ownerCtx, { ticketId: tid, save: true });

  console.log("Adding automation rules…");
  await createRule(ownerCtx, { name: "Escalate security events", event: "ticket.created", conditions: [{ field: "type", operator: "equals", value: "security_event" }], actions: [{ type: "set_priority", value: "p1" }, { type: "assign_team", teamId: teamId("Security") }], priority: 0 });
  await createRule(ownerCtx, { name: "Tag access requests", event: "ticket.created", conditions: [{ field: "type", operator: "equals", value: "access_request" }], actions: [{ type: "add_tag", value: "access-review" }], priority: 1 });
  await createRule(ownerCtx, { name: "Notify on P1", event: "ticket.created", conditions: [{ field: "priority", operator: "equals", value: "p1" }], actions: [{ type: "send_notification", userIds: [itManager], title: "New P1 ticket", body: "A P1 was just created." }], priority: 2 });
  await createRule(ownerCtx, { name: "Auto-acknowledge new requests", event: "ticket.created", conditions: [], actions: [{ type: "add_internal_note", body: "Auto-acknowledged by automation — an agent will follow up shortly." }], priority: 3 });
  await createRule(ownerCtx, { name: "Webhook on new tickets", event: "ticket.created", conditions: [], actions: [{ type: "call_webhook", url: "https://hooks.globex-demo.test/itsm" }], priority: 5, enabled: false });

  console.log("Submitting catalog requests (creates approvals + run history)…");
  const submissions: { ticketId: string; approvals: number }[] = [];
  for (let i = 0; i < 18; i++) {
    const reqCtx = rand(reqCtxs);
    let res;
    const pick = i % 4;
    if (pick === 0) res = await submitCatalog(reqCtx, catalog.resetPw, { username: rand(["riley", "jordan", "casey", "avery"]), reason: "Locked out" });
    else if (pick === 1) res = await submitCatalog(reqCtx, catalog.laptop, { model: rand(["MacBook Pro 14\"", "ThinkPad X1", "Dell XPS 15"]), justification: "Current device failing" });
    else if (pick === 2) res = await submitCatalog(reqCtx, catalog.access, { system: rand(["CRM", "Finance", "Analytics", "GitHub"]), level: rand(["Read", "Write"]) });
    else res = await submitCatalog(reqCtx, catalog.onboard, { employee: rand(["Pat Doe", "Sky Rivers", "Lee Park"]), startDate: "2026-07-15", role: "Analyst" });
    submissions.push(res);
  }
  // Resolve some approvals so the manager inbox shows a realistic mix (some pending, some decided).
  console.log("Deciding some approvals (leaving several pending)…");
  let decided = 0;
  for (const s of submissions) {
    if (s.approvals === 0) continue;
    const appr = await withTenant(T, itManager, (tx) => tx.approval.findFirst({ where: { ticketId: s.ticketId, status: "pending" }, select: { id: true } }));
    if (!appr) continue;
    if (decided < 5) { await decideApproval(itMgrCtx, appr.id, "approved", "Approved — proceed."); decided++; }
    else if (decided < 7) { await decideApproval(itMgrCtx, appr.id, "rejected", "Not justified at this time."); decided++; }
    else break; // leave the rest pending
  }
  return owner;
}

async function liftPlan(tenantId: string, ownerId: string) {
  await withTenant(tenantId, ownerId, (tx) =>
    tx.billingAccount.update({ where: { tenantId }, data: { plan: "enterprise", limits: PLAN_LIMITS.enterprise as object } }),
  );
}

async function seedCompany() {
  console.log("Creating demo company (Globex Demo Corp)…");
  const owner = await provisionCompany({ name: "Demo Admin", companyName: "Globex Demo Corp", email: `owner${DEMO_EMAIL_DOMAIN}`, password: DEMO_PW });
  return populateCompany(owner, "Globex Demo Corp", true, "");
}

/** Fills an existing individual workspace with personal tickets/tasks/notes. */
export async function populatePersonal(
  ind: { tenantId: string; userId: string; defaultTeamId: string }, markAsDemo: boolean,
) {
  if (markAsDemo) await markDemo(ind.tenantId, ind.userId, "Demo Individual Workspace");
  else await liftPlan(ind.tenantId, ind.userId);
  const ctx = ctxOf(ind.userId, ind.tenantId, [ind.defaultTeamId]);
  const categoryIds = await withTenant(ind.tenantId, ind.userId, (tx) => tx.category.findMany({ where: { tenantId: ind.tenantId }, select: { id: true } })).then((c) => c.map((x) => x.id));

  await progress("personal tickets", Array.from({ length: 45 }, () => () => makeTicket(ctx, ind.defaultTeamId, [], categoryIds)));
  await progress("personal tasks", Array.from({ length: 30 }, () => async () => {
    await createTask(ctx, { title: rand(TASKS), teamId: ind.defaultTeamId, priority: rand(["p2", "p3", "p4"]) as "p2" | "p3" | "p4" });
  }));
  for (const [title, body] of [["My VPN setup notes", "Steps I followed to get the VPN working."], ["Useful shortcuts", "A few keyboard shortcuts I keep forgetting."]] as [string, string][])
    await createArticle(ctx, { title, body, status: "published", source: "human" });
}

async function seedIndividual() {
  console.log("Creating demo individual workspace…");
  const ind = await provisionIndividual({ name: "Demo Individual", email: `individual${DEMO_EMAIL_DOMAIN}`, password: DEMO_PW });
  await populatePersonal(ind, true);
}

async function main() {
  await ensureSystemRolesAndPermissions();
  console.log("Purging existing demo space…");
  const purged = await purgeDemo();
  console.log(`  removed ${purged.tenants} tenant(s), ${purged.users} user(s).\n`);

  await seedCompany();
  await seedIndividual();

  console.log("\n✓ Sales demo ready. Logins (password: " + DEMO_PW + "):");
  console.log("  COMPANY — Globex Demo Corp:");
  console.log(`    owner${DEMO_EMAIL_DOMAIN}            — owner / admin (sees everything)`);
  console.log(`    ivy.manager${DEMO_EMAIL_DOMAIN}      — IT Support manager (approvals inbox, team queue)`);
  console.log(`    marcus.security${DEMO_EMAIL_DOMAIN}  — Security manager`);
  console.log(`    alex.agent${DEMO_EMAIL_DOMAIN}       — IT agent (assigned tickets + tasks)`);
  console.log(`    riley${DEMO_EMAIL_DOMAIN}            — requester (own tickets + catalog requests)`);
  console.log("  INDIVIDUAL:");
  console.log(`    individual${DEMO_EMAIL_DOMAIN}       — personal workspace`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
