-- Corrective migration: the previous migration added SUPER_ADMIN as a
-- fourth UserRole value, intending it as a role above ADMIN. Before this
-- correction landed, a seed script briefly promoted one real user
-- (official@thebotcompany.in) to SUPER_ADMIN; that broke every existing
-- `role === "ADMIN"` check in the app (coach management, group
-- management, chat moderation, the question repository, portal
-- navigation), since those checks treat ADMIN as the sole top-authority
-- role and were never written to also accept SUPER_ADMIN. That user has
-- already been manually restored to ADMIN. This migration removes the
-- now-unused SUPER_ADMIN value so the enum matches the app's actual role
-- model going forward: ADMIN is, and remains, the top authority.
BEGIN;

CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'MENTOR', 'MENTEE');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MENTEE';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";

COMMIT;
