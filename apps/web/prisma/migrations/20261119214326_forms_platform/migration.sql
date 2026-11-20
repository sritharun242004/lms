-- CreateEnum
CREATE TYPE "FormCategory" AS ENUM ('GENERIC', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormQuestionType" AS ENUM ('SHORT_ANSWER', 'PARAGRAPH', 'MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN', 'LINEAR_SCALE', 'STAR_RATING', 'DATE', 'TIME', 'FILE_UPLOAD', 'MULTIPLE_CHOICE_GRID', 'CHECKBOX_GRID');

-- CreateEnum
CREATE TYPE "FormInvitationStatus" AS ENUM ('SENT', 'OPENED', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'FORM';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "theme_preference" TEXT;

-- CreateTable
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "header_image_url" TEXT,
    "theme_color" TEXT,
    "category" "FormCategory" NOT NULL DEFAULT 'GENERIC',
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "allow_multiple_submissions" BOOLEAN NOT NULL DEFAULT false,
    "feedback_target_type" TEXT,
    "feedback_target_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_sections" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "form_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_questions" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "template_id" TEXT,
    "type" "FormQuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_question_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "FormQuestionType" NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_invitations" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "message_id" TEXT,
    "group_id" TEXT,
    "recipient_user_id" TEXT NOT NULL,
    "status" "FormInvitationStatus" NOT NULL DEFAULT 'SENT',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),

    CONSTRAINT "form_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_responses" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "invitation_id" TEXT,
    "respondent_user_id" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_answers" (
    "id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "form_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_answer_files" (
    "id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_answer_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forms_created_by_id_idx" ON "forms"("created_by_id");

-- CreateIndex
CREATE INDEX "forms_status_idx" ON "forms"("status");

-- CreateIndex
CREATE INDEX "forms_category_idx" ON "forms"("category");

-- CreateIndex
CREATE UNIQUE INDEX "form_sections_form_id_order_key" ON "form_sections"("form_id", "order");

-- CreateIndex
CREATE INDEX "form_questions_template_id_idx" ON "form_questions"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_questions_section_id_order_key" ON "form_questions"("section_id", "order");

-- CreateIndex
CREATE INDEX "form_question_templates_created_by_id_idx" ON "form_question_templates"("created_by_id");

-- CreateIndex
CREATE INDEX "form_question_templates_type_idx" ON "form_question_templates"("type");

-- CreateIndex
CREATE INDEX "form_question_templates_category_idx" ON "form_question_templates"("category");

-- CreateIndex
CREATE INDEX "form_invitations_form_id_idx" ON "form_invitations"("form_id");

-- CreateIndex
CREATE INDEX "form_invitations_recipient_user_id_idx" ON "form_invitations"("recipient_user_id");

-- CreateIndex
CREATE INDEX "form_invitations_message_id_idx" ON "form_invitations"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_responses_invitation_id_key" ON "form_responses"("invitation_id");

-- CreateIndex
CREATE INDEX "form_responses_form_id_idx" ON "form_responses"("form_id");

-- CreateIndex
CREATE INDEX "form_responses_respondent_user_id_idx" ON "form_responses"("respondent_user_id");

-- CreateIndex
CREATE INDEX "form_answers_response_id_idx" ON "form_answers"("response_id");

-- CreateIndex
CREATE INDEX "form_answers_question_id_idx" ON "form_answers"("question_id");

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_sections" ADD CONSTRAINT "form_sections_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "form_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "form_question_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_question_templates" ADD CONSTRAINT "form_question_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_invitations" ADD CONSTRAINT "form_invitations_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_invitations" ADD CONSTRAINT "form_invitations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_invitations" ADD CONSTRAINT "form_invitations_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "form_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_respondent_user_id_fkey" FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "form_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "form_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
