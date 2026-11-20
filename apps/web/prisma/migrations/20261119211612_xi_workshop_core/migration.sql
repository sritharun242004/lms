-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING_PAYMENT', 'PROOF_SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUESTED');

-- CreateEnum
CREATE TYPE "WorkshopPackage" AS ENUM ('DAY1', 'DAY2', 'BOTH');

-- CreateEnum
CREATE TYPE "AiExperienceLevel" AS ENUM ('NEW', 'SOMETIMES', 'DAILY');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- CreateTable
CREATE TABLE "workshop_registrations" (
    "id" TEXT NOT NULL,
    "registration_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "workshop_package" "WorkshopPackage" NOT NULL,
    "previous_day1_attendance" BOOLEAN,
    "previous_day1_when" TEXT,
    "ai_experience_level" "AiExperienceLevel" NOT NULL,
    "ai_use_case" TEXT,
    "subscriptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needs_gst_invoice" BOOLEAN NOT NULL DEFAULT false,
    "gst_company_name" TEXT,
    "gstin" TEXT,
    "referred_by" TEXT,
    "age_confirmed" BOOLEAN NOT NULL,
    "amount_in_inr" INTEGER NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "onboarded_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_payment_proofs" (
    "id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_payment_verification_logs" (
    "id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "action" "RegistrationStatus" NOT NULL,
    "note" TEXT,
    "admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_payment_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workshop_registrations_registration_code_key" ON "workshop_registrations"("registration_code");

-- CreateIndex
CREATE INDEX "workshop_registrations_status_idx" ON "workshop_registrations"("status");

-- CreateIndex
CREATE INDEX "workshop_registrations_email_idx" ON "workshop_registrations"("email");

-- CreateIndex
CREATE INDEX "workshop_payment_proofs_registration_id_idx" ON "workshop_payment_proofs"("registration_id");

-- CreateIndex
CREATE INDEX "workshop_payment_verification_logs_registration_id_idx" ON "workshop_payment_verification_logs"("registration_id");

-- AddForeignKey
ALTER TABLE "workshop_registrations" ADD CONSTRAINT "workshop_registrations_onboarded_user_id_fkey" FOREIGN KEY ("onboarded_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_payment_proofs" ADD CONSTRAINT "workshop_payment_proofs_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "workshop_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_payment_verification_logs" ADD CONSTRAINT "workshop_payment_verification_logs_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "workshop_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_payment_verification_logs" ADD CONSTRAINT "workshop_payment_verification_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
