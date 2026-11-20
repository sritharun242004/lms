-- Decouples WorkshopRegistration from the CMS's User/Group domain
-- entirely: no automatic participant account, no automatic group
-- assignment. A WhatsApp group invite URL is now entered manually by an
-- admin during approval instead. Also adds the Individual/Company
-- registration-type selector and company-only identity fields.
--
-- One existing test registration (XI-2026-0001) has a non-null
-- onboarded_user_id; dropping the column discards only that reference —
-- the User and GroupMember rows it pointed to are untouched.

-- CreateEnum
CREATE TYPE "RegistrationKind" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- DropForeignKey
ALTER TABLE "workshop_registrations" DROP CONSTRAINT "workshop_registrations_onboarded_user_id_fkey";

-- AlterTable
ALTER TABLE "workshop_registrations"
  DROP COLUMN "onboarded_user_id",
  ADD COLUMN "registration_kind" "RegistrationKind" NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "company_name" TEXT,
  ADD COLUMN "company_address" TEXT,
  ADD COLUMN "company_gstin" TEXT,
  ADD COLUMN "whatsapp_group_invite_url" TEXT,
  ALTER COLUMN "company" DROP NOT NULL;
