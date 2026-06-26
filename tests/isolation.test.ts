import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionIndividual, provisionCompany } from "@/lib/provisioning";

// Unique emails per run so the suite is repeatable without truncation (app role
// cannot TRUNCATE). These tests run as flowdesk_app — RLS is in force.
const uniq = () => `${randomUUID()}@test.local`;

beforeAll(async () => {
  await ensureSystemRolesAndPermissions();
});

describe("signup provisioning (acceptance #1, #2)", () => {
  it("individual signup creates an individual tenant + Personal Workspace", async () => {
    const { tenantId, userId } = await provisionIndividual({
      name: "Ind User",
      email: uniq(),
      password: "password123",
    });

    const data = await withTenant(tenantId, userId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const teams = await tx.team.findMany();
      return { tenant, teams };
    });

    expect(data.tenant?.type).toBe("individual");
    expect(data.teams).toHaveLength(1);
    expect(data.teams[0].name).toBe("Personal Workspace");
    expect(data.teams[0].isDefault).toBe(true);
  });

  it("company signup creates a company tenant + default teams", async () => {
    const { tenantId, userId } = await provisionCompany({
      name: "Co Admin",
      email: uniq(),
      companyName: "Test Co",
      password: "password123",
    });

    const data = await withTenant(tenantId, userId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const teams = await tx.team.findMany({ orderBy: { createdAt: "asc" } });
      return { tenant, teams };
    });

    expect(data.tenant?.type).toBe("company");
    const names = data.teams.map((t) => t.name);
    expect(names).toContain("IT Support");
    expect(names).toContain("General Requests");
  });
});

describe("RLS tenant isolation (INV-1, acceptance #3, #15)", () => {
  it("cannot read another tenant's team even with a valid guessed id", async () => {
    const a = await provisionCompany({
      name: "A", email: uniq(), companyName: "Tenant A", password: "password123",
    });
    const b = await provisionCompany({
      name: "B", email: uniq(), companyName: "Tenant B", password: "password123",
    });

    // A real team id that genuinely exists in tenant B.
    const bTeam = await withTenant(b.tenantId, b.userId, (tx) =>
      tx.team.findFirst({ select: { id: true } }),
    );
    expect(bTeam).not.toBeNull();

    // From tenant A's context, the same id must be invisible (RLS), not a 403 — null.
    const leaked = await withTenant(a.tenantId, a.userId, (tx) =>
      tx.team.findUnique({ where: { id: bTeam!.id } }),
    );
    expect(leaked).toBeNull();

    // And counting B's teams from A's context yields zero.
    const visibleFromA = await withTenant(a.tenantId, a.userId, (tx) =>
      tx.team.count({ where: { tenantId: b.tenantId } }),
    );
    expect(visibleFromA).toBe(0);
  });

  it("WITH CHECK blocks writing a row into another tenant", async () => {
    const a = await provisionCompany({
      name: "A2", email: uniq(), companyName: "Tenant A2", password: "password123",
    });
    const b = await provisionCompany({
      name: "B2", email: uniq(), companyName: "Tenant B2", password: "password123",
    });

    // Under A2's context, attempt to create a team carrying B2's tenant_id → rejected.
    await expect(
      withTenant(a.tenantId, a.userId, (tx) =>
        tx.team.create({
          data: { tenantId: b.tenantId, name: "evil", slug: `evil-${randomUUID().slice(0, 6)}` },
        }),
      ),
    ).rejects.toThrow();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
