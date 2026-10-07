CREATE TYPE "QuestionLibraryType" AS ENUM ('MULTIPLE_CHOICE', 'WORD_CLOUD', 'OPEN_ENDED');

ALTER TABLE "question_library_items"
ADD COLUMN "type" "QuestionLibraryType" NOT NULL DEFAULT 'MULTIPLE_CHOICE';

CREATE INDEX "question_library_items_type_idx"
ON "question_library_items"("type");
