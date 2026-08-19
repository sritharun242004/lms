ALTER TABLE "groups"
  ADD COLUMN "avatar_url" TEXT;

CREATE TABLE "user_profile_photos" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_profile_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_profile_photos" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "group_profile_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_profile_photos_user_id_key"
  ON "user_profile_photos"("user_id");
CREATE UNIQUE INDEX "group_profile_photos_group_id_key"
  ON "group_profile_photos"("group_id");

ALTER TABLE "user_profile_photos"
  ADD CONSTRAINT "user_profile_photos_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_profile_photos"
  ADD CONSTRAINT "group_profile_photos_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
