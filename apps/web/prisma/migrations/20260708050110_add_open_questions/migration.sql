-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'OPEN_QUESTION';

-- CreateTable
CREATE TABLE "open_questions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_answers" (
    "id" TEXT NOT NULL,
    "open_question_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "open_questions_message_id_key" ON "open_questions"("message_id");

-- CreateIndex
CREATE INDEX "open_answers_open_question_id_idx" ON "open_answers"("open_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "open_answers_open_question_id_user_id_key" ON "open_answers"("open_question_id", "user_id");

-- AddForeignKey
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_answers" ADD CONSTRAINT "open_answers_open_question_id_fkey" FOREIGN KEY ("open_question_id") REFERENCES "open_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_answers" ADD CONSTRAINT "open_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

