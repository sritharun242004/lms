-- Large form uploads live in S3; the row keeps only the object key. Existing
-- rows keep their bytes in `data`, so nothing is moved or lost.
ALTER TABLE "form_answer_files" ALTER COLUMN "data" DROP NOT NULL,
ADD COLUMN "storage_key" TEXT;

CREATE UNIQUE INDEX "form_answer_files_storage_key_key" ON "form_answer_files"("storage_key");
