import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/authz";
import {
  summarizeTicket, draftTicketResponse, generateKnowledgeArticle, decideOutput,
  assertCanSendExternal,
} from "@/lib/ai/service";
import { updateAiSettings, DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { redact } from "@/lib/ai/redaction";

const uniq = () => `${randomUUID()}@test.local`;

beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function freshTenant() {
  const { tenantId, userId } = await provisionCompany({
    name: "O", email: uniq(), companyName: "AiCo", password: "password123",
  });
  const teams = await withTenant(tenantId, userId, (tx) =>
    tx.teamMembership.findMany({ where: { userId }, select: { teamId: true } }),
  );
  const ctx: AuthContext = { userId, tenantId, teamIds: teams.map((t) => t.teamId), permissionKeys: new Set(PERMISSION_KEYS) };
  return { tenantId, ctx };
}

const auditCount = (tenantId: string, action: string) =>
  withTenant(tenantId, undefined, (tx) => tx.auditLog.count({ where: { action } }));

describe("deterministic mock (acceptance #12)", () => {
  it("returns identical summary for identical input, no key required", async () => {
    const { ctx } = await freshTenant();
    const a = await summarizeTicket(ctx, { text: "The email server is down for everyone." });
    const b = await summarizeTicket(ctx, { text: "The email server is down for everyone." });
    expect(a.status).toBe("ok");
    expect(a.isMock).toBe(true);
    expect((a.content as { summary: string }).summary).toBe((b.content as { summary: string }).summary);
    expect((a.content as { summary: string }).summary).toContain("Summary:");
  });

  it("logs an ai_requests row + ai_outputs with aiSuggested=true", async () => {
    const { tenantId, ctx } = await freshTenant();
    const r = await summarizeTicket(ctx, { text: "Printer jam on floor 3." });
    const data = await withTenant(tenantId, ctx.userId, async (tx) => ({
      req: await tx.aIRequest.findUnique({ where: { id: r.requestId } }),
      out: await tx.aIOutput.findUnique({ where: { id: r.outputId! } }),
      usage: await tx.aITokenUsage.findFirst({ where: { tenantId } }),
    }));
    expect(data.req?.status).toBe("ok");
    expect(data.out?.aiSuggested).toBe(true);
    expect(data.usage?.requestCount).toBeGreaterThanOrEqual(1);
  });
});

describe("PII redaction (redaction-by-default)", () => {
  it("strips emails and phone numbers", () => {
    const { text, redacted } = redact("Contact me at john@example.com or 555-123-4567 please");
    expect(redacted).toBe(true);
    expect(text).toContain("[REDACTED_EMAIL]");
    expect(text).toContain("[REDACTED_PHONE]");
    expect(text).not.toContain("john@example.com");
  });

  it("marks the ai_request redacted when the prompt contains PII", async () => {
    const { tenantId, ctx } = await freshTenant();
    const r = await summarizeTicket(ctx, { text: "User email is jane@corp.com and cannot log in" });
    const req = await withTenant(tenantId, ctx.userId, (tx) => tx.aIRequest.findUnique({ where: { id: r.requestId } }));
    expect(req?.redacted).toBe(true);
  });
});

describe("budget hard-stop", () => {
  it("blocks once usage exceeds the limit and audits the block", async () => {
    const { tenantId, ctx } = await freshTenant();
    await updateAiSettings(ctx, { budget: { tokenLimit: 1, windowDays: 30 } });

    const first = await summarizeTicket(ctx, { text: "first call uses several tokens here" });
    expect(first.status).toBe("ok"); // usage was 0 < 1
    const second = await summarizeTicket(ctx, { text: "second call should be blocked" });
    expect(second.status).toBe("budget_blocked");
    expect(await auditCount(tenantId, "ai.budget_blocked")).toBeGreaterThanOrEqual(1);
  });
});

describe("guardrails", () => {
  it("never permits external send by default; drafts are not sent", async () => {
    const { ctx } = await freshTenant();
    expect(() => assertCanSendExternal(DEFAULT_AI_SETTINGS)).toThrow();
    const draft = await draftTicketResponse(ctx, { text: "How do I reset my password?" });
    expect(draft.status).toBe("ok");
    expect(draft.externalSendAllowed).toBe(false);
    expect(draft.aiSuggested).toBe(true);
  });
});

describe("AI config + outputs are audited", () => {
  it("settings change and accept/reject write audit rows", async () => {
    const { tenantId, ctx } = await freshTenant();
    await updateAiSettings(ctx, { enabled: true, perModule: { summarize: true } });
    expect(await auditCount(tenantId, "ai.settings_updated")).toBeGreaterThanOrEqual(1);

    const r = await summarizeTicket(ctx, { text: "anything" });
    await decideOutput(ctx, r.outputId!, true);
    expect(await auditCount(tenantId, "ai.output_accepted")).toBe(1);
  });

  it("a disabled module returns status=disabled without calling the provider", async () => {
    const { ctx } = await freshTenant();
    await updateAiSettings(ctx, { perModule: { summarize: false } });
    const r = await summarizeTicket(ctx, { text: "should be disabled" });
    expect(r.status).toBe("disabled");
    expect(r.content).toBeUndefined();
  });
});

describe("knowledge generation", () => {
  it("generateKnowledgeArticle(save) creates a draft AI-generated article", async () => {
    const { tenantId, ctx } = await freshTenant();
    const r = await generateKnowledgeArticle(ctx, { text: "VPN will not connect after update", save: true });
    expect(r.status).toBe("ok");
    expect(r.articleId).toBeTruthy();

    const article = await withTenant(tenantId, ctx.userId, (tx) =>
      tx.knowledgeArticle.findUnique({ where: { id: r.articleId! }, include: { versions: true } }),
    );
    expect(article?.status).toBe("draft");
    expect(article?.source).toBe("ai");
    expect(article?.versions[0].aiGenerated).toBe(true);
  });
});
