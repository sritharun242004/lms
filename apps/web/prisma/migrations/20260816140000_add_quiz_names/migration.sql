ALTER TABLE "question_library_items"
ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Untitled quiz';

CREATE INDEX "question_library_items_name_idx"
ON "question_library_items"("name");
