-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'WORD_CLOUD';

-- CreateTable
CREATE TABLE "word_clouds" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "max_words_per_participant" INTEGER NOT NULL DEFAULT 1,
    "max_word_length" INTEGER NOT NULL DEFAULT 30,
    "allow_multiple_submissions" BOOLEAN NOT NULL DEFAULT false,
    "profanity_filter" BOOLEAN NOT NULL DEFAULT true,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_clouds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_cloud_entries" (
    "id" TEXT NOT NULL,
    "word_cloud_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_cloud_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_cloud_submissions" (
    "id" TEXT NOT NULL,
    "word_cloud_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_cloud_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "word_clouds_message_id_key" ON "word_clouds"("message_id");

-- CreateIndex
CREATE INDEX "word_cloud_entries_word_cloud_id_idx" ON "word_cloud_entries"("word_cloud_id");

-- CreateIndex
CREATE UNIQUE INDEX "word_cloud_entries_word_cloud_id_text_key" ON "word_cloud_entries"("word_cloud_id", "text");

-- CreateIndex
CREATE INDEX "word_cloud_submissions_word_cloud_id_idx" ON "word_cloud_submissions"("word_cloud_id");

-- CreateIndex
CREATE INDEX "word_cloud_submissions_user_id_idx" ON "word_cloud_submissions"("user_id");

-- CreateIndex
CREATE INDEX "word_cloud_submissions_entry_id_idx" ON "word_cloud_submissions"("entry_id");

-- AddForeignKey
ALTER TABLE "word_clouds" ADD CONSTRAINT "word_clouds_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_cloud_entries" ADD CONSTRAINT "word_cloud_entries_word_cloud_id_fkey" FOREIGN KEY ("word_cloud_id") REFERENCES "word_clouds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_cloud_submissions" ADD CONSTRAINT "word_cloud_submissions_word_cloud_id_fkey" FOREIGN KEY ("word_cloud_id") REFERENCES "word_clouds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_cloud_submissions" ADD CONSTRAINT "word_cloud_submissions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "word_cloud_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_cloud_submissions" ADD CONSTRAINT "word_cloud_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

