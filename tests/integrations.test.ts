import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { ForbiddenError, type AuthContext } from "@/lib/authz";
import { createApiKey, verifyApiKey, requireScope, revokeApiKey } from "@/lib/integrations/apikeys";
import { createIntegration } from "@/lib/admin/integrations";
import { ingestEmail } from "@/lib/integrations/email";

const uniq = () => `${randomUUID()}@test.local`;
beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({ name: "O", email: uniq(), companyName: "IntCo", password: "password123" });
  const teams = await withTenant(tenantId, userId, (tx) => tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }));
  const ctx: AuthContext = { userId, tenantId, teamIds: teams.map((t) => t.teamId), permissionKeys: new Set(PERMISSION_KEYS) };
  return { tenantId, ctx };
}

describe("API keys", () => {
  it("are hashed, scope-enforced, and revocable", async () => {
    const { ctx } = await freshTenant();
    const { key } = await createApiKey(ctx, "CI key", ["ticket.read"]);
    expect(key.startsWith("fd_")).toBe(true);

    const verified = await verifyApiKey(key);
    expect(verified?.scopes).toEqual(["ticket.read"]);
    expect(() => requireScope(verified!, "ticket.read")).not.toThrow();
    expect(() => requireScope(verified!, "ticket.write")).toThrow(ForbiddenError);

    // The raw key is never stored — only its hash.
    const stored = await prisma.apiKey.findFirst({ where: { keyHash: key } });
    expect(stored).toBeNull();

    const id = verified!.apiKeyId;
    await revokeApiKey(ctx, id);
    expect(await verifyApiKey(key)).toBeNull();
  });
});

describe("integration config is audited", () => {
  it("creating an integration writes an audit row", async () => {
    const { tenantId, ctx } = await freshTenant();
    await createIntegration(ctx, { kind: "slack", name: "Ops Slack", config: { webhookUrl: "x" } });
    const audited = await withTenant(tenantId, ctx.userId, (tx) =>
      tx.auditLog.count({ where: { action: "integration.created" } }),
    );
    expect(audited).toBeGreaterThanOrEqual(1);
  });
});

describe("email-to-ticket", () => {
  it("rejects DMARC-failed (spoofed) mail", async () => {
    const { ctx } = await freshTenant();
    await expect(
      ingestEmail(ctx, {
        messageId: "<m1>", from: "evil@attacker.test", to: ["support@acme.test"],
        subject: "urgent", bodyText: "click here", spoof: { dmarc: "fail" },
      }, {}),
    ).rejects.toThrow(/spoof|dmarc/i);
  });

  it("creates a ticket from a clean inbound email", async () => {
    const { tenantId, ctx } = await freshTenant();
    const result = await ingestEmail(ctx, {
      messageId: "<m2>", from: "user@corp.test", to: ["support@acme.test"],
      subject: "Cannot print", bodyText: "The printer is jammed.\n-- \nSent from my phone",
      spoof: { spf: "pass", dkim: "pass", dmarc: "pass" },
    }, {});
    expect(result.created).toBe(true);

    const ticket = await withTenant(tenantId, ctx.userId, (tx) =>
      tx.ticket.findUnique({ where: { id: result.ticketId }, select: { source: true, title: true, description: true } }),
    );
    expect(ticket?.source).toBe("email");
    expect(ticket?.title).toBe("Cannot print");
    expect(ticket?.description).not.toContain("Sent from my phone"); // signature stripped
  });

  it("blocks a sender not in the allowed list", async () => {
    const { ctx } = await freshTenant();
    await expect(
      ingestEmail(ctx, {
        messageId: "<m3>", from: "random@nowhere.test", to: ["support@acme.test"],
        subject: "hi", bodyText: "x", spoof: { dmarc: "pass" },
      }, { allowedSenders: ["corp.test"] }),
    ).rejects.toThrow(/allowed/i);
  });
});
