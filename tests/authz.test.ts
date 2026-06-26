import { describe, it, expect } from "vitest";
import {
  scopeFor,
  scopeAtLeast,
  hasPermission,
  requirePermission,
  canAccessTeam,
  ForbiddenError,
  type AuthContext,
} from "@/lib/authz";

function ctx(keys: string[], teamIds: string[] = []): AuthContext {
  return {
    userId: "u",
    tenantId: "t",
    teamIds,
    permissionKeys: new Set(keys),
  };
}

describe("scope resolution (ADR-3)", () => {
  it("returns the highest held scope", () => {
    expect(scopeFor(ctx(["ticket.read.own"]), "ticket.read")).toBe("own");
    expect(scopeFor(ctx(["ticket.read.team"]), "ticket.read")).toBe("team");
    expect(
      scopeFor(ctx(["ticket.read.own", "ticket.read.all"]), "ticket.read"),
    ).toBe("all");
  });

  it("returns null when no scope held", () => {
    expect(scopeFor(ctx([]), "ticket.read")).toBeNull();
  });

  it("higher scope satisfies lower requirement", () => {
    expect(scopeAtLeast("all", "team")).toBe(true);
    expect(scopeAtLeast("own", "team")).toBe(false);
    expect(scopeAtLeast(null, "own")).toBe(false);
  });
});

describe("permission checks", () => {
  it("hasPermission is exact-key", () => {
    expect(hasPermission(ctx(["ticket.create"]), "ticket.create")).toBe(true);
    expect(hasPermission(ctx(["ticket.create"]), "ticket.delete")).toBe(false);
  });

  it("requirePermission throws ForbiddenError when missing", () => {
    expect(() => requirePermission(ctx([]), "admin.view")).toThrow(ForbiddenError);
    expect(() => requirePermission(ctx(["admin.view"]), "admin.view")).not.toThrow();
  });
});

describe("team access (ADR-4)", () => {
  it("members can access their team", () => {
    expect(canAccessTeam(ctx([], ["team-a"]), "team-a")).toBe(true);
    expect(canAccessTeam(ctx([], ["team-a"]), "team-b")).toBe(false);
  });

  it("admin.configure grants cross-team access", () => {
    expect(canAccessTeam(ctx(["admin.configure"], []), "team-b")).toBe(true);
  });
});
