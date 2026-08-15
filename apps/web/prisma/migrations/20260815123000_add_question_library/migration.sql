CREATE TABLE "question_library_items" ("id" TEXT NOT NULL, "question" TEXT NOT NULL, "chart_type" "PollChartType" NOT NULL DEFAULT 'BAR', "created_by_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "question_library_items_pkey" PRIMARY KEY ("id"));
CREATE TABLE "question_library_options" ("id" TEXT NOT NULL, "question_id" TEXT NOT NULL, "text" TEXT NOT NULL, "order" INTEGER NOT NULL, CONSTRAINT "question_library_options_pkey" PRIMARY KEY ("id"));
CREATE INDEX "question_library_items_created_by_id_idx" ON "question_library_items"("created_by_id");
CREATE UNIQUE INDEX "question_library_options_question_id_order_key" ON "question_library_options"("question_id", "order");
ALTER TABLE "question_library_items" ADD CONSTRAINT "question_library_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_library_options" ADD CONSTRAINT "question_library_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
