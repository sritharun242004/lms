-- CreateEnum
CREATE TYPE "PromptMatrixKind" AS ENUM ('CORE', 'TASK', 'SKILL');

-- CreateTable
CREATE TABLE "prompt_matrices" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "PromptMatrixKind" NOT NULL,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_matrix_questions" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,
    "element" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "prompt_matrix_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_bot_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled prompt',
    "base_prompt" TEXT NOT NULL,
    "task_matrix_id" TEXT,
    "task_detected" BOOLEAN NOT NULL DEFAULT true,
    "score_revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_bot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_bot_answers" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "not_relevant" BOOLEAN NOT NULL DEFAULT false,
    "scored_at" TIMESTAMP(3),

    CONSTRAINT "prompt_bot_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_bot_enhancements" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "unanswered_question_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT NOT NULL,
    "instructions_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_bot_enhancements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_daily" (
    "user_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("user_id","day","feature")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "limits" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_matrices_slug_key" ON "prompt_matrices"("slug");

-- CreateIndex
CREATE INDEX "prompt_matrices_kind_is_active_idx" ON "prompt_matrices"("kind", "is_active");

-- CreateIndex
CREATE INDEX "prompt_matrix_questions_matrix_id_order_idx" ON "prompt_matrix_questions"("matrix_id", "order");

-- CreateIndex
CREATE INDEX "prompt_bot_sessions_user_id_updated_at_idx" ON "prompt_bot_sessions"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_bot_answers_session_id_question_id_key" ON "prompt_bot_answers"("session_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_bot_enhancements_session_id_version_key" ON "prompt_bot_enhancements"("session_id", "version");

-- AddForeignKey
ALTER TABLE "prompt_matrices" ADD CONSTRAINT "prompt_matrices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_matrix_questions" ADD CONSTRAINT "prompt_matrix_questions_matrix_id_fkey" FOREIGN KEY ("matrix_id") REFERENCES "prompt_matrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_bot_sessions" ADD CONSTRAINT "prompt_bot_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_bot_sessions" ADD CONSTRAINT "prompt_bot_sessions_task_matrix_id_fkey" FOREIGN KEY ("task_matrix_id") REFERENCES "prompt_matrices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_bot_answers" ADD CONSTRAINT "prompt_bot_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "prompt_bot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_bot_answers" ADD CONSTRAINT "prompt_bot_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "prompt_matrix_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_bot_enhancements" ADD CONSTRAINT "prompt_bot_enhancements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "prompt_bot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed: built-in Prompt Bot matrices (src/lib/prompt-bot/builtin-matrices.ts)
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_core','core','Design Think','The core questions every prompt should answer.','CORE',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_1','pbm_core',0,'Why are we doing this?','The underlying reason or problem, and why it matters now.','goal',true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_2','pbm_core',1,'What is going on in the background (Context)?','Relevant situation: organisation, constraints, history, what has been tried.','context',true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_3','pbm_core',2,'Who is the target audience?','Who will read or use the output, how specifically they are described, and what they care about.','persona',true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_4','pbm_core',3,'What is needed to do this?','Inputs, data, resources, tools or access the AI or person needs.','data',true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_5','pbm_core',4,'What are the goals and objectives & How do we measure them?','Concrete objectives and how success will be measured.','goal',true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_6','pbm_core',5,'What are the different ways we can approach this?','Options or angles considered, or permission for the AI to propose options.','iteration',true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_7','pbm_core',6,'What does success look like?','A description of the ideal finished output: format, length, tone and quality bar.','output',true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_core_8','pbm_core',7,'What is the systematic plan to work on this?','Steps or sequence, including iteration such as asking clarifying questions first.','plan',true);
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_image','image','Image','Creating an image, graphic, illustration or visual.','TASK',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_image_1','pbm_image',0,'Why do we need this image?','The purpose the image serves and the decision or action it supports.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_image_2','pbm_image',1,'What is the full context?','Where it sits: campaign, document, brand, surrounding content and constraints.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_image_3','pbm_image',2,'Who is the target audience?','Who will see it and what they already know or expect.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_image_4','pbm_image',3,'What are we trying to express/show using this image?','The subject, message or idea the image must show clearly.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_image_5','pbm_image',4,'What are we trying to get people to feel/take away when they see this image?','The emotion or single takeaway the viewer should leave with.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_image_6','pbm_image',5,'Where will this image be published?','Channel, format, size or aspect ratio, and any brand or platform rules.',NULL,true);
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_presentation','presentation','Presentation','Slide decks, pitches, board or team presentations.','TASK',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_presentation_1','pbm_presentation',0,'What decision or action should the audience take after this presentation?','The specific decision, approval or action expected at the end.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_presentation_2','pbm_presentation',1,'What does the audience already know, and what do they doubt?','Their starting knowledge, objections and concerns.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_presentation_3','pbm_presentation',2,'What is the one key message?','A single sentence the audience must remember.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_presentation_4','pbm_presentation',3,'What evidence, data or stories support it?','Facts, figures, examples or cases available to use.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_presentation_5','pbm_presentation',4,'How long is the slot and how many slides?','Time available and target slide count.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_presentation_6','pbm_presentation',5,'What brand or visual style applies?','Template, colours, tone and any visual rules.',NULL,true);
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_writing','writing','Writing','Emails, posts, articles, announcements and other written pieces.','TASK',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_writing_1','pbm_writing',0,'What should the reader do or feel after reading?','The action or reaction the piece must produce.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_writing_2','pbm_writing',1,'Who exactly is the reader and what is your relationship?','The reader''s role, seniority and relationship to the writer.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_writing_3','pbm_writing',2,'What tone and voice should it have?','Formality, warmth, confidence and any voice rules.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_writing_4','pbm_writing',3,'What length and format?','Word count or length, structure and channel format.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_writing_5','pbm_writing',4,'What must be included or avoided?','Mandatory points, facts, links, and topics or phrases to avoid.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_writing_6','pbm_writing',5,'Is there an example of writing you like?','A sample or description of a style to match.',NULL,true);
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_strategy','strategy','Strategy','Plans, decisions, strategy and prioritisation.','TASK',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_strategy_1','pbm_strategy',0,'What decision or plan is needed, and by when?','The decision to make or plan to produce, and the deadline.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_strategy_2','pbm_strategy',1,'What constraints apply (budget, people, time)?','Hard limits on money, people, time or technology.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_strategy_3','pbm_strategy',2,'Which options are on the table?','Alternatives already considered, or none yet.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_strategy_4','pbm_strategy',3,'What criteria decide between them?','How options will be judged and weighted.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_strategy_5','pbm_strategy',4,'What risks worry you most?','The main risks and what failure would look like.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_strategy_6','pbm_strategy',5,'Who must agree?','Stakeholders whose approval or buy-in is needed.',NULL,true);
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_code','code','Code','Software, automation and technical work.','TASK',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_code_1','pbm_code',0,'What should the software do, for whom?','The behaviour required and who uses it.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_code_2','pbm_code',1,'What stack, environment or existing code is involved?','Languages, frameworks, versions, systems and existing code.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_code_3','pbm_code',2,'What are the inputs and outputs?','Data coming in, results going out, and their formats.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_code_4','pbm_code',3,'What edge cases and errors matter?','Unusual inputs, failures and how they must be handled.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_code_5','pbm_code',4,'How will we know it works (tests, acceptance criteria)?','Tests or acceptance criteria that prove it is done.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_code_6','pbm_code',5,'What must it not do (security, performance limits)?','Security, privacy, performance and compliance constraints.',NULL,true);
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_research','research','Research','Investigating, analysing and summarising information.','TASK',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_research_1','pbm_research',0,'What question must the research answer?','The precise question and the decision it informs.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_research_2','pbm_research',1,'What scope, period and geography?','Boundaries: topics, time range and regions.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_research_3','pbm_research',2,'Which sources are trusted or excluded?','Preferred, required and forbidden sources.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_research_4','pbm_research',3,'How deep: overview or detailed analysis?','Depth and level of detail expected.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_research_5','pbm_research',4,'What format should the findings take?','Report, table, bullets or brief, and its length.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_research_6','pbm_research',5,'How should uncertainty be reported?','How to flag confidence, gaps and conflicting evidence.',NULL,true);
INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES ('pbm_data','data','Data analysis','Analysing data, metrics, spreadsheets and reports.','TASK',true,true,NOW(),NOW());
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_data_1','pbm_data',0,'What question should the data answer?','The business question behind the analysis.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_data_2','pbm_data',1,'What data is available and in what shape?','Sources, columns, size, quality and format.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_data_3','pbm_data',2,'Which metrics or definitions apply?','How key metrics are defined and calculated.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_data_4','pbm_data',3,'What comparisons or segments matter?','Periods, groups or benchmarks to compare.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_data_5','pbm_data',4,'What output: table, chart, narrative?','The form of the result and its level of detail.',NULL,true);
INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES ('pbq_data_6','pbm_data',5,'Who will act on the result?','The decision-maker and what they will do with it.',NULL,true);
INSERT INTO "ai_settings" ("id","limits","updated_at") VALUES ('singleton','{"score":300,"enhance":30,"skill_split":10,"skill_generate":20}'::jsonb,NOW());
