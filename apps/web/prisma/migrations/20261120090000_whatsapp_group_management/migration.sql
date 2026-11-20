-- CreateTable
CREATE TABLE "workshop_whatsapp_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invite_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_whatsapp_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workshop_whatsapp_groups_is_active_idx" ON "workshop_whatsapp_groups"("is_active");

-- AlterTable
ALTER TABLE "workshop_registrations"
  ADD COLUMN "whatsapp_group_id" TEXT,
  ADD COLUMN "whatsapp_group_name" TEXT;

-- CreateIndex
CREATE INDEX "workshop_registrations_whatsapp_group_id_idx" ON "workshop_registrations"("whatsapp_group_id");

-- AddForeignKey
ALTER TABLE "workshop_registrations" ADD CONSTRAINT "workshop_registrations_whatsapp_group_id_fkey" FOREIGN KEY ("whatsapp_group_id") REFERENCES "workshop_whatsapp_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
