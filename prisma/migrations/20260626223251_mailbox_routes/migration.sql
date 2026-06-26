-- CreateTable
CREATE TABLE "mailbox_routes" (
    "mailbox" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_routes_pkey" PRIMARY KEY ("mailbox")
);
