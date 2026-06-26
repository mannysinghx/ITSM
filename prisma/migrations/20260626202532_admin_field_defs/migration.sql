-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'number', 'select', 'date', 'bool');

-- CreateTable
CREATE TABLE "ticket_field_defs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL DEFAULT 'text',
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visibility" JSONB NOT NULL DEFAULT '{}',
    "validation" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_field_defs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_field_defs_tenant_id_key_key" ON "ticket_field_defs"("tenant_id", "key");

-- AddForeignKey
ALTER TABLE "ticket_field_defs" ADD CONSTRAINT "ticket_field_defs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
