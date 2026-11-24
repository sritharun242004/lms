-- CreateEnum
CREATE TYPE "SkillItemKind" AS ENUM ('CUSTOM', 'CATALOG');

-- CreateEnum
CREATE TYPE "SkillItemStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "skill_packs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'My skills',
    "description" TEXT NOT NULL,
    "role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_pack_items" (
    "id" TEXT NOT NULL,
    "pack_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "SkillItemKind" NOT NULL,
    "catalog_entry_id" TEXT,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "SkillItemStatus" NOT NULL DEFAULT 'DRAFT',
    "files" JSONB,
    "validation_errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score_revision" INTEGER NOT NULL DEFAULT 0,
    "generation_started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_pack_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_item_answers" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "not_relevant" BOOLEAN NOT NULL DEFAULT false,
    "scored_at" TIMESTAMP(3),

    CONSTRAINT "skill_item_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_catalog_entries" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "bundlable" BOOLEAN NOT NULL DEFAULT false,
    "install_notes" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_packs_user_id_updated_at_idx" ON "skill_packs"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "skill_pack_items_pack_id_order_idx" ON "skill_pack_items"("pack_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "skill_item_answers_item_id_question_id_key" ON "skill_item_answers"("item_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_catalog_entries_slug_key" ON "skill_catalog_entries"("slug");

-- AddForeignKey
ALTER TABLE "skill_packs" ADD CONSTRAINT "skill_packs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_pack_items" ADD CONSTRAINT "skill_pack_items_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "skill_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_pack_items" ADD CONSTRAINT "skill_pack_items_catalog_entry_id_fkey" FOREIGN KEY ("catalog_entry_id") REFERENCES "skill_catalog_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_item_answers" ADD CONSTRAINT "skill_item_answers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "skill_pack_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_item_answers" ADD CONSTRAINT "skill_item_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "prompt_matrix_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_catalog_entries" ADD CONSTRAINT "skill_catalog_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed: skill-definition matrix (src/lib/skills/builtin-skill-matrix.ts)
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_skill_definition','skill-definition','Skill definition','Questions that turn a task into a reusable AI skill (Skills Builder).','SKILL',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_1','pbm_skill_definition',0,'When should this skill be used?','Situations, requests and phrases that should trigger it, and when it should not be used.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_2','pbm_skill_definition',1,'What context does it need to know?','Background about the person, team, company or domain that stays true across uses.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_3','pbm_skill_definition',2,'What inputs will it receive?','What the user provides each time (files, notes, data) and in what shape.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_4','pbm_skill_definition',3,'What are the steps?','The sequence of work, decisions and checks.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_5','pbm_skill_definition',4,'What does a great output look like?','Format, structure, length, tone, and an example if possible.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_6','pbm_skill_definition',5,'What is the quality bar?','Criteria the output must meet before it is done.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_7','pbm_skill_definition',6,'What tools, files or resources does it use?','Templates, reference documents, scripts, apps or plugins it relies on.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_skill_8','pbm_skill_definition',7,'What should it avoid?','Mistakes, sensitive areas, things never to do.',NULL,true);

-- Seed: skill catalog (src/lib/skills/catalog-seed.ts; licenses from scripts/verify-catalog-licenses.ts)
INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES ('scat_impeccable','impeccable','Impeccable','Design, critique, audit and polish user interfaces: layout, typography, colour, accessibility and UX copy for websites, apps and dashboards.','https://github.com/pbakaus/impeccable','Apache-2.0',true,'Follow the installation steps in the source repository''s README.',ARRAY['design','ui','ux']::TEXT[],true,NOW(),NOW());
INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES ('scat_pptx','pptx','PowerPoint presentations','Create and edit PowerPoint presentations (.pptx): decks, slides, layouts and speaker notes.','https://github.com/anthropics/skills/tree/main/skills/pptx','Apache-2.0',true,'Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.',ARRAY['presentations','documents']::TEXT[],true,NOW(),NOW());
INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES ('scat_docx','docx','Word documents','Create and edit Word documents (.docx), including formatting, tables, comments and tracked changes.','https://github.com/anthropics/skills/tree/main/skills/docx','Apache-2.0',true,'Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.',ARRAY['documents','writing']::TEXT[],true,NOW(),NOW());
INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES ('scat_xlsx','xlsx','Excel spreadsheets','Create, analyse and edit Excel spreadsheets (.xlsx) with formulas, formatting and charts.','https://github.com/anthropics/skills/tree/main/skills/xlsx','Apache-2.0',true,'Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.',ARRAY['spreadsheets','data']::TEXT[],true,NOW(),NOW());
INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES ('scat_pdf','pdf','PDF files','Read, extract, fill, merge, split and create PDF files.','https://github.com/anthropics/skills/tree/main/skills/pdf','Apache-2.0',true,'Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.',ARRAY['documents','pdf']::TEXT[],true,NOW(),NOW());
INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES ('scat_frontend_design','frontend-design','Frontend design','Build distinctive, production-grade web interfaces with a clear visual direction instead of generic layouts.','https://github.com/anthropics/skills/tree/main/skills/frontend-design','Apache-2.0',true,'Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.',ARRAY['design','frontend']::TEXT[],true,NOW(),NOW());
INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES ('scat_skill_creator','skill-creator','Skill creator','Create, refine and test skills, including writing descriptions that trigger reliably and evaluating them.','https://github.com/anthropics/skills/tree/main/skills/skill-creator','Apache-2.0',true,'Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.',ARRAY['skills','meta']::TEXT[],true,NOW(),NOW());
