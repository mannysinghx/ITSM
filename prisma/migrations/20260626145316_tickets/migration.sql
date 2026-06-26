-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('p1', 'p2', 'p3', 'p4');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('portal', 'email', 'api', 'admin', 'ai');

-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('open', 'pending', 'resolved', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "LinkRelation" AS ENUM ('relates', 'blocks', 'duplicate', 'parent', 'child');

-- CreateTable
CREATE TABLE "ticket_statuses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StatusCategory" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ticket_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priority_matrix" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "impact" "Severity" NOT NULL,
    "urgency" "Severity" NOT NULL,
    "priority" "Priority" NOT NULL,

    CONSTRAINT "priority_matrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "team_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "team_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "assignee_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type_id" UUID NOT NULL,
    "category_id" UUID,
    "status_id" UUID NOT NULL,
    "impact" "Severity" NOT NULL DEFAULT 'medium',
    "urgency" "Severity" NOT NULL DEFAULT 'medium',
    "priority" "Priority" NOT NULL DEFAULT 'p3',
    "source" "TicketSource" NOT NULL DEFAULT 'portal',
    "channel" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "due_at" TIMESTAMP(3),
    "first_response_due_at" TIMESTAMP(3),
    "resolution_due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "comment_id" UUID,
    "uploader_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_watchers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "linked_ticket_id" UUID NOT NULL,
    "relation" "LinkRelation" NOT NULL DEFAULT 'relates',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_statuses_tenant_id_key_key" ON "ticket_statuses"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_types_tenant_id_key_key" ON "ticket_types"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "priority_matrix_tenant_id_impact_urgency_key" ON "priority_matrix"("tenant_id", "impact", "urgency");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_parent_id_key" ON "categories"("tenant_id", "name", "parent_id");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_team_id_idx" ON "tickets"("tenant_id", "team_id");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_status_id_idx" ON "tickets"("tenant_id", "status_id");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_requester_id_idx" ON "tickets"("tenant_id", "requester_id");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_assignee_id_idx" ON "tickets"("tenant_id", "assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_tenant_id_ticket_number_key" ON "tickets"("tenant_id", "ticket_number");

-- CreateIndex
CREATE INDEX "ticket_comments_tenant_id_ticket_id_idx" ON "ticket_comments"("tenant_id", "ticket_id");

-- CreateIndex
CREATE INDEX "ticket_history_tenant_id_ticket_id_created_at_idx" ON "ticket_history"("tenant_id", "ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_attachments_tenant_id_ticket_id_idx" ON "ticket_attachments"("tenant_id", "ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_watchers_ticket_id_user_id_key" ON "ticket_watchers"("ticket_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_links_ticket_id_linked_ticket_id_relation_key" ON "ticket_links"("ticket_id", "linked_ticket_id", "relation");

-- AddForeignKey
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_matrix" ADD CONSTRAINT "priority_matrix_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "ticket_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
