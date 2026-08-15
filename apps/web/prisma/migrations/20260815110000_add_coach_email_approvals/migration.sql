CREATE TABLE "coach_email_approvals" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_email_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coach_email_approvals_email_key" ON "coach_email_approvals"("email");
CREATE INDEX "coach_email_approvals_approved_by_id_idx" ON "coach_email_approvals"("approved_by_id");

ALTER TABLE "coach_email_approvals" ADD CONSTRAINT "coach_email_approvals_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
