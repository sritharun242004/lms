-- Simplifies the workshop payment/verification model per an explicit
-- change request: payment is never verified inside this application
-- any more. The participant self-reports with a single "Payment Done"
-- click; an admin follows up outside the app. This removes the entire
-- payment-proof upload/verification workflow and the WhatsApp group
-- management/assignment feature added in the previous migration.
--
-- Data safety: this repo had exactly 2 real registrations at the time
-- of writing (none are deleted here). Before dropping anything, the
-- new `payment_marked_done_at` column is backfilled from whatever
-- proof/approval history already exists, so an already-approved
-- registration doesn't silently lose its "something happened" signal.
BEGIN;

-- 1. Add the new column first, and backfill it from the data we are
--    about to drop, so real history isn't lost — just collapsed into
--    the new, simpler shape.
ALTER TABLE "workshop_registrations" ADD COLUMN "payment_marked_done_at" TIMESTAMP(3);

UPDATE "workshop_registrations" r
SET "payment_marked_done_at" = COALESCE(
  (SELECT MAX(p."submitted_at") FROM "workshop_payment_proofs" p WHERE p."registration_id" = r."id"),
  r."updated_at"
)
WHERE r."status" IN ('PROOF_SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED');

-- 2. Drop the WhatsApp group assignment columns/FK/index on
--    workshop_registrations (the group management table itself is
--    dropped in step 4).
ALTER TABLE "workshop_registrations" DROP CONSTRAINT IF EXISTS "workshop_registrations_whatsapp_group_id_fkey";
DROP INDEX IF EXISTS "workshop_registrations_whatsapp_group_id_idx";
ALTER TABLE "workshop_registrations"
  DROP COLUMN IF EXISTS "whatsapp_group_id",
  DROP COLUMN IF EXISTS "whatsapp_group_name",
  DROP COLUMN IF EXISTS "whatsapp_group_invite_url";

-- 3. Drop the verification audit log (tied entirely to the removed
--    approve/reject/resubmission workflow).
DROP TABLE IF EXISTS "workshop_payment_verification_logs";

-- 4. Drop payment-proof storage and WhatsApp group management tables.
DROP TABLE IF EXISTS "workshop_payment_proofs";
DROP TABLE IF EXISTS "workshop_whatsapp_groups";

-- 5. Shrink RegistrationStatus from 6 values down to 2. Existing rows
--    are remapped, never dropped: anything that had real proof
--    activity or was already approved becomes PAYMENT_DONE; anything
--    rejected or awaiting resubmission goes back to PENDING_PAYMENT,
--    since no payment was ever actually confirmed for those.
CREATE TYPE "RegistrationStatus_new" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_DONE');

ALTER TABLE "workshop_registrations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "workshop_registrations" ALTER COLUMN "status" TYPE "RegistrationStatus_new" USING (
  CASE "status"::text
    WHEN 'PROOF_SUBMITTED' THEN 'PAYMENT_DONE'
    WHEN 'UNDER_VERIFICATION' THEN 'PAYMENT_DONE'
    WHEN 'APPROVED' THEN 'PAYMENT_DONE'
    WHEN 'REJECTED' THEN 'PENDING_PAYMENT'
    WHEN 'RESUBMISSION_REQUESTED' THEN 'PENDING_PAYMENT'
    ELSE 'PENDING_PAYMENT'
  END::"RegistrationStatus_new"
);
ALTER TABLE "workshop_registrations" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

ALTER TYPE "RegistrationStatus" RENAME TO "RegistrationStatus_old";
ALTER TYPE "RegistrationStatus_new" RENAME TO "RegistrationStatus";
DROP TYPE "RegistrationStatus_old";

COMMIT;
