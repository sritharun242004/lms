-- Admin verification of payment, separate from the participant's own
-- "Payment Done" click. Nullable with no default: every existing
-- registration starts unverified.
ALTER TABLE "workshop_registrations" ADD COLUMN "payment_verified_at" TIMESTAMP(3);
