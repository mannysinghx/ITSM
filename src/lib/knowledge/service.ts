import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { type AuthContext, requirePermission, hasPermission } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { slugify } from "@/lib/validation";

export interface CreateArticleInput {
  title: string;
  body: string;
  summary?: string;
  teamId?: string | null;
  status?: "draft" | "published" | "archived";
  source?: "human" | "ai" | "ticket";
  sourceTicketId?: string | null;
  aiGenerated?: boolean;
}

/** Creates an article + its first version (append-only history) in one tx. */
export async function createArticleTx(tx: Tx, ctx: AuthContext, input: CreateArticleInput) {
  const article = await tx.knowledgeArticle.create({
    data: {
      tenantId: ctx.tenantId, teamId: input.teamId ?? null,
      title: input.title, slug: slugify(input.title),
      status: input.status ?? "draft", source: input.source ?? "human",
      sourceTicketId: input.sourceTicketId ?? null, createdByUserId: ctx.userId,
    },
  });
  const version = await tx.knowledgeArticleVersion.create({
    data: {
      tenantId: ctx.tenantId, articleId: article.id, version: 1,
      body: input.body, summary: input.summary ?? null,
      aiGenerated: input.aiGenerated ?? false, createdByUserId: ctx.userId,
    },
  });
  await tx.knowledgeArticle.update({ where: { id: article.id }, data: { currentVersionId: version.id } });
  await writeAudit(tx, {
    tenantId: ctx.tenantId, actorId: ctx.userId,
    action: "knowledge.created", entityType: "knowledge_article", entityId: article.id,
    metadata: { source: input.source ?? "human", aiGenerated: input.aiGenerated ?? false },
  });
  return article;
}

export async function createArticle(ctx: AuthContext, input: CreateArticleInput) {
  requirePermission(ctx, "knowledge.create");
  return withTenant(ctx.tenantId, ctx.userId, (tx) => createArticleTx(tx, ctx, input));
}

export async function listArticles(ctx: AuthContext, status?: string) {
  return withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.knowledgeArticle.findMany({
      where: status ? { status: status as "draft" | "published" | "archived" } : {},
      select: { id: true, title: true, slug: true, status: true, source: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  );
}

export async function getArticle(ctx: AuthContext, id: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const article = await tx.knowledgeArticle.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!article) throw new NotFoundError("Article not found");
    const current = article.versions.find((v) => v.id === article.currentVersionId) ?? article.versions[0];
    return {
      id: article.id, title: article.title, slug: article.slug, status: article.status,
      source: article.source, body: current?.body ?? "", summary: current?.summary ?? null,
      versions: article.versions.map((v) => ({ version: v.version, aiGenerated: v.aiGenerated, createdAt: v.createdAt })),
      canEdit: hasPermission(ctx, "knowledge.create"),
      canPublish: hasPermission(ctx, "knowledge.publish"),
    };
  });
}

export async function updateArticle(ctx: AuthContext, id: string, patch: { title?: string; body?: string; summary?: string }) {
  requirePermission(ctx, "knowledge.create");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const article = await tx.knowledgeArticle.findUnique({
      where: { id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!article) throw new NotFoundError("Article not found");
    if (patch.title) await tx.knowledgeArticle.update({ where: { id }, data: { title: patch.title } });

    if (patch.body !== undefined) {
      const nextVersion = (article.versions[0]?.version ?? 0) + 1;
      const version = await tx.knowledgeArticleVersion.create({
        data: {
          tenantId: ctx.tenantId, articleId: id, version: nextVersion,
          body: patch.body, summary: patch.summary ?? null, createdByUserId: ctx.userId,
        },
      });
      await tx.knowledgeArticle.update({ where: { id }, data: { currentVersionId: version.id } });
    }
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "knowledge.updated", entityType: "knowledge_article", entityId: id, metadata: {},
    });
    return { id };
  });
}

export async function publishArticle(ctx: AuthContext, id: string) {
  requirePermission(ctx, "knowledge.publish");
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const article = await tx.knowledgeArticle.findUnique({ where: { id }, select: { id: true } });
    if (!article) throw new NotFoundError("Article not found");
    await tx.knowledgeArticle.update({ where: { id }, data: { status: "published" } });
    await writeAudit(tx, {
      tenantId: ctx.tenantId, actorId: ctx.userId,
      action: "knowledge.published", entityType: "knowledge_article", entityId: id, metadata: {},
    });
    return { id };
  });
}

export async function addFeedback(ctx: AuthContext, id: string, helpful: boolean, comment?: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const article = await tx.knowledgeArticle.findUnique({ where: { id }, select: { id: true } });
    if (!article) throw new NotFoundError("Article not found");
    await tx.knowledgeFeedback.create({
      data: { tenantId: ctx.tenantId, articleId: id, userId: ctx.userId, helpful, comment: comment ?? null },
    });
    return { ok: true };
  });
}
