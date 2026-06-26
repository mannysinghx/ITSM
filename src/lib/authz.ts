/**
 * Authorization engine (ADR-3). Pure, IO-free predicates so they can be unit-tested
 * and reused by both single-object gates and list-filter builders (INV-2).
 *
 * The AuthContext is built ONCE per request (see lib/auth/context.ts) and threaded
 * down; helpers here never re-query the database.
 */

export type Scope = "own" | "team" | "all";
const SCOPE_RANK: Record<Scope, number> = { own: 1, team: 2, all: 3 };

export interface AuthContext {
  userId: string;
  tenantId: string;
  teamIds: string[];
  permissionKeys: Set<string>;
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Exact-key check. */
export function hasPermission(ctx: AuthContext, key: string): boolean {
  return ctx.permissionKeys.has(key);
}

/** Throws ForbiddenError unless the context holds the permission. */
export function requirePermission(ctx: AuthContext, key: string): void {
  if (!hasPermission(ctx, key)) {
    throw new ForbiddenError(`Missing permission: ${key}`);
  }
}

/** Throws unless the context holds ANY of the keys. */
export function requireAnyPermission(ctx: AuthContext, keys: string[]): void {
  if (!keys.some((k) => hasPermission(ctx, k))) {
    throw new ForbiddenError(`Missing any of: ${keys.join(", ")}`);
  }
}

/**
 * Highest scope held for an action (e.g. action="ticket.read" inspects
 * ticket.read.own/team/all). Returns null if none held. `all` implies `team`
 * implies `own` (ADR-3) — callers compare ranks, not exact strings.
 */
export function scopeFor(ctx: AuthContext, action: string): Scope | null {
  let best: Scope | null = null;
  for (const scope of ["own", "team", "all"] as Scope[]) {
    if (ctx.permissionKeys.has(`${action}.${scope}`)) {
      if (!best || SCOPE_RANK[scope] > SCOPE_RANK[best]) best = scope;
    }
  }
  return best;
}

/** True if `held` scope is at least `required`. */
export function scopeAtLeast(held: Scope | null, required: Scope): boolean {
  return held !== null && SCOPE_RANK[held] >= SCOPE_RANK[required];
}

/**
 * Generic team gate (ADR-4). True if the user is a member of the team, or holds a
 * tenant-wide admin capability. Per-resource gates (e.g. canReadTicket in Phase 2)
 * layer ownership exceptions on top of this.
 */
export function canAccessTeam(ctx: AuthContext, teamId: string): boolean {
  return ctx.teamIds.includes(teamId) || hasPermission(ctx, "admin.configure");
}
