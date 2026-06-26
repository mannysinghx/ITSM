/**
 * Permission vocabulary + default role definitions (master spec §10.3, §30).
 * Scopes are ordered levels of one action: own < team < all (ADR-3). The authz
 * engine collapses `ticket.read.own/team/all` into a single highest-scope decision.
 */

export interface PermissionDef {
  key: string;
  description: string;
  category: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // tenant / admin
  { key: "tenant.view", description: "View tenant", category: "tenant" },
  { key: "tenant.update", description: "Update tenant settings", category: "tenant" },
  { key: "admin.view", description: "Access admin area", category: "admin" },
  { key: "admin.configure", description: "Configure tenant", category: "admin" },
  // users
  { key: "user.invite", description: "Invite users", category: "user" },
  { key: "user.update", description: "Update users", category: "user" },
  { key: "user.suspend", description: "Suspend users", category: "user" },
  // teams
  { key: "team.create", description: "Create teams", category: "team" },
  { key: "team.update", description: "Update teams", category: "team" },
  { key: "team.delete", description: "Delete teams", category: "team" },
  { key: "team.manage_members", description: "Manage team members", category: "team" },
  // roles
  { key: "role.create", description: "Create roles", category: "role" },
  { key: "role.update", description: "Update roles", category: "role" },
  { key: "role.assign", description: "Assign roles", category: "role" },
  // tickets (scoped: own/team/all)
  { key: "ticket.create", description: "Create tickets", category: "ticket" },
  { key: "ticket.read.own", description: "Read own tickets", category: "ticket" },
  { key: "ticket.read.team", description: "Read team tickets", category: "ticket" },
  { key: "ticket.read.all", description: "Read all tenant tickets", category: "ticket" },
  { key: "ticket.update.own", description: "Update own tickets", category: "ticket" },
  { key: "ticket.update.team", description: "Update team tickets", category: "ticket" },
  { key: "ticket.update.all", description: "Update all tickets", category: "ticket" },
  { key: "ticket.assign", description: "Assign tickets", category: "ticket" },
  { key: "ticket.resolve", description: "Resolve tickets", category: "ticket" },
  { key: "ticket.close", description: "Close tickets", category: "ticket" },
  { key: "ticket.delete", description: "Delete tickets", category: "ticket" },
  { key: "ticket.comment.public", description: "Add public comments", category: "ticket" },
  { key: "ticket.comment.internal", description: "Add internal notes", category: "ticket" },
  // tasks
  { key: "task.create", description: "Create tasks", category: "task" },
  { key: "task.read.team", description: "Read team tasks", category: "task" },
  { key: "task.update.team", description: "Update team tasks", category: "task" },
  { key: "task.delete", description: "Delete tasks", category: "task" },
  // catalog / workflow / sla / knowledge / asset
  { key: "catalog.create", description: "Create catalog items", category: "catalog" },
  { key: "catalog.update", description: "Update catalog items", category: "catalog" },
  { key: "workflow.create", description: "Create workflows", category: "workflow" },
  { key: "workflow.update", description: "Update workflows", category: "workflow" },
  { key: "sla.create", description: "Create SLA policies", category: "sla" },
  { key: "sla.update", description: "Update SLA policies", category: "sla" },
  { key: "knowledge.create", description: "Create knowledge articles", category: "knowledge" },
  { key: "knowledge.publish", description: "Publish knowledge articles", category: "knowledge" },
  { key: "asset.create", description: "Create assets", category: "asset" },
  { key: "asset.update", description: "Update assets", category: "asset" },
  // reporting / audit / integrations / ai / billing
  { key: "report.view", description: "View reports", category: "report" },
  { key: "audit.read", description: "Read audit logs", category: "audit" },
  { key: "integration.manage", description: "Manage integrations", category: "integration" },
  { key: "ai.manage", description: "Manage AI settings", category: "ai" },
  { key: "billing.manage", description: "Manage billing", category: "billing" },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Default system roles (master spec §30). `*` = all permissions. */
export interface RoleDef {
  key: string;
  name: string;
  description: string;
  permissions: string[] | "*";
}

export const DEFAULT_ROLES: RoleDef[] = [
  {
    key: "owner",
    name: "Owner",
    description: "Tenant owner — full access",
    permissions: "*",
  },
  {
    key: "admin",
    name: "Admin",
    description: "Tenant administrator",
    permissions: PERMISSION_KEYS.filter((k) => k !== "billing.manage").concat([]),
  },
  {
    key: "team_manager",
    name: "Team Manager",
    description: "Manages a team queue",
    permissions: [
      "tenant.view",
      "ticket.create", "ticket.read.team", "ticket.update.team", "ticket.assign",
      "ticket.resolve", "ticket.close", "ticket.comment.public", "ticket.comment.internal",
      "task.create", "task.read.team", "task.update.team",
      "team.manage_members", "report.view",
    ],
  },
  {
    key: "agent",
    name: "Agent",
    description: "Works tickets in assigned teams",
    permissions: [
      "tenant.view",
      "ticket.create", "ticket.read.team", "ticket.update.team", "ticket.assign",
      "ticket.resolve", "ticket.comment.public", "ticket.comment.internal",
      "task.read.team", "task.update.team",
    ],
  },
  {
    key: "requester",
    name: "Requester",
    description: "Submits and tracks own tickets",
    permissions: [
      "tenant.view",
      "ticket.create", "ticket.read.own", "ticket.update.own", "ticket.comment.public",
    ],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Read-only access plus audit logs",
    permissions: ["tenant.view", "ticket.read.all", "report.view", "audit.read"],
  },
];

export function resolveRolePermissions(role: RoleDef): string[] {
  return role.permissions === "*" ? [...PERMISSION_KEYS] : role.permissions;
}
