-- CreateEnum
CREATE TYPE "AiUseCase" AS ENUM ('classify', 'priority', 'team', 'summarize', 'draft', 'knowledge');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('ok', 'error', 'budget_blocked', 'disabled');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('human', 'ai', 'ticket');

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "team_id" UUID,
    "user_id" UUID,
    "use_case" "AiUseCase" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "is_mock" BOOLEAN NOT NULL DEFAULT true,
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "status" "AiStatus" NOT NULL DEFAULT 'ok',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_outputs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ai_request_id" UUID NOT NULL,
    "output_type" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "ai_suggested" BOOLEAN NOT NULL DEFAULT true,
    "accepted" BOOLEAN,
    "accepted_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_token_usage" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "team_id" UUID,
    "user_id" UUID,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "request_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "team_id" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'draft',
    "source" "KnowledgeSource" NOT NULL DEFAULT 'human',
    "source_ticket_id" UUID,
    "current_version_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_feedback" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "user_id" UUID,
    "helpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_requests_tenant_id_created_at_idx" ON "ai_requests"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_outputs_tenant_id_idx" ON "ai_outputs"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_token_usage_tenant_id_period_end_idx" ON "ai_token_usage"("tenant_id", "period_end");

-- CreateIndex
CREATE INDEX "knowledge_articles_tenant_id_status_idx" ON "knowledge_articles"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_tenant_id_slug_key" ON "knowledge_articles"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_versions_article_id_version_key" ON "knowledge_article_versions"("article_id", "version");

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_outputs" ADD CONSTRAINT "ai_outputs_ai_request_id_fkey" FOREIGN KEY ("ai_request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_token_usage" ADD CONSTRAINT "ai_token_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_feedback" ADD CONSTRAINT "knowledge_feedback_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
