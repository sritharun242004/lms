-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'SCALE';

-- AlterEnum
ALTER TYPE "QuestionLibraryType" ADD VALUE 'SCALE';

-- CreateTable
CREATE TABLE "question_library_scale_statements" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "max" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "question_library_scale_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scales" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scale_statements" (
    "id" TEXT NOT NULL,
    "scale_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "min" INTEGER NOT NULL DEFAULT 0,
    "max" INTEGER NOT NULL DEFAULT 5,
    "left_label" TEXT NOT NULL DEFAULT 'Strongly disagree',
    "right_label" TEXT NOT NULL DEFAULT 'Strongly agree',

    CONSTRAINT "scale_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scale_responses" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scale_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_library_scale_statements_question_id_order_key" ON "question_library_scale_statements"("question_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "scales_message_id_key" ON "scales"("message_id");

-- CreateIndex
CREATE INDEX "scale_statements_scale_id_idx" ON "scale_statements"("scale_id");

-- CreateIndex
CREATE UNIQUE INDEX "scale_statements_scale_id_order_key" ON "scale_statements"("scale_id", "order");

-- CreateIndex
CREATE INDEX "scale_responses_user_id_idx" ON "scale_responses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scale_responses_statement_id_user_id_key" ON "scale_responses"("statement_id", "user_id");

-- AddForeignKey
ALTER TABLE "question_library_scale_statements" ADD CONSTRAINT "question_library_scale_statements_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scales" ADD CONSTRAINT "scales_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_statements" ADD CONSTRAINT "scale_statements_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_responses" ADD CONSTRAINT "scale_responses_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "scale_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_responses" ADD CONSTRAINT "scale_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
