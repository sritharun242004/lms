ALTER TABLE "users"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disabled_at" TIMESTAMP(3);

ALTER TABLE "coach_email_approvals"
  ADD COLUMN "claimed_by_id" TEXT;

-- Pair pre-existing claimed approvals with MENTOR users by normalized email.
-- ROW_NUMBER makes legacy case-variant duplicates deterministic while keeping
-- both sides one-to-one before the unique constraint is installed.
WITH ranked_approvals AS (
  SELECT
    "id",
    LOWER(BTRIM("email")) AS normalized_email,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM("email"))
      ORDER BY "created_at" ASC, "id" ASC
    ) AS ordinal
  FROM "coach_email_approvals"
  WHERE "claimed_at" IS NOT NULL
),
ranked_mentors AS (
  SELECT
    "id",
    LOWER(BTRIM("email")) AS normalized_email,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM("email"))
      ORDER BY "created_at" ASC, "id" ASC
    ) AS ordinal
  FROM "users"
  WHERE "role" = 'MENTOR' AND "email" IS NOT NULL
)
UPDATE "coach_email_approvals" AS approval
SET "claimed_by_id" = mentor."id"
FROM ranked_approvals AS ranked_approval
INNER JOIN ranked_mentors AS mentor
  ON mentor.normalized_email = ranked_approval.normalized_email
 AND mentor.ordinal = ranked_approval.ordinal
WHERE approval."id" = ranked_approval."id";

CREATE UNIQUE INDEX "coach_email_approvals_claimed_by_id_key"
  ON "coach_email_approvals"("claimed_by_id");

ALTER TABLE "coach_email_approvals"
  ADD CONSTRAINT "coach_email_approvals_claimed_by_id_fkey"
  FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
