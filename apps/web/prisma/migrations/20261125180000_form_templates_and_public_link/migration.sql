-- Form templates (pinned in the Forms "Templates" group) and an opt-in
-- public link. Both flags default to false, so every existing form is
-- unchanged.
ALTER TABLE "forms" ADD COLUMN     "is_template" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_link_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "forms_is_template_idx" ON "forms"("is_template");

-- Seed the "AI Empowerment for Teams Certificate" feedback form as the first
-- template, recreated from the team's existing certificate form. It is owned
-- by the earliest admin and left as a DRAFT so it stays editable; staff use
-- it through "Use template", which makes their own copy. Skipped entirely on
-- a database with no admin yet (a fresh install), where there is no owner.
DO $$
DECLARE
  owner_id TEXT;
  form_id TEXT := 'tpl' || substr(md5(random()::text || clock_timestamp()::text), 1, 22);
  section_id TEXT := 'tpl' || substr(md5(random()::text || clock_timestamp()::text || 's'), 1, 22);
  rating JSONB := '{"options": ["Excellent", "Very good", "Good", "Fair", "Poor"]}';
BEGIN
  SELECT "id" INTO owner_id FROM "users" WHERE "role" = 'ADMIN' ORDER BY "created_at" ASC LIMIT 1;
  IF owner_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "forms" ("id", "title", "description", "category", "status", "created_by_id", "is_template", "updated_at")
  VALUES (
    form_id,
    'AI Empowerment for Teams Certificate',
    E'Congratulations on completing the Vjal Institute''s AI Empowerment for Teams Course. We hope this is a step in your amazing journey forward in using AI!\n\nWe are on a mission to Evangelize and Teach 1 million leaders on AI.\n\nPlease fill out the following fields so we can e-mail your completion certificate.\n\nFeedback on the course and our facilitator instructor would really help us make the course better and more engaging. All your comments are kept anonymous.',
    'FEEDBACK',
    'DRAFT',
    owner_id,
    true,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "form_sections" ("id", "form_id", "order") VALUES (section_id, form_id, 0);

  INSERT INTO "form_questions" ("id", "section_id", "type", "title", "description", "required", "order", "config")
  SELECT
    'tpl' || substr(md5(random()::text || clock_timestamp()::text || q.ord::text), 1, 22),
    section_id, q.type::"FormQuestionType", q.title, q.description, q.required, q.ord, q.config
  FROM (VALUES
    (0,  'SHORT_ANSWER', 'Instructor ID: (eg AB1821)', NULL, true, '{"defaultValue": "MN1494"}'::jsonb),
    (1,  'PARAGRAPH',    'Please help Us Spread the Love! Share a Blurb or Comment We Can Feature.', NULL, true, '{}'::jsonb),
    (2,  'SHORT_ANSWER', 'Name (for certificate)', 'First and last name', true, '{}'::jsonb),
    (3,  'SHORT_ANSWER', 'Email', '(for certificate)', true, '{"format": "email"}'::jsonb),
    (4,  'DATE',         'Date of event', NULL, true, '{}'::jsonb),
    (5,  'SHORT_ANSWER', 'Organization', NULL, true, '{}'::jsonb),
    (6,  'SHORT_ANSWER', 'Designation / Role / Title', NULL, true, '{}'::jsonb),
    (7,  'SHORT_ANSWER', 'Home City', NULL, true, '{}'::jsonb),
    (8,  'MULTIPLE_CHOICE', 'Please Rate the Quality of the Instructor / Trainer / Faculty (Confidential)', NULL, true, rating),
    (9,  'PARAGRAPH',    'Feedback about the instructor? (Confidential)', NULL, true, '{}'::jsonb),
    (10, 'MULTIPLE_CHOICE', 'Please Rate the Quality of the Content', NULL, true, rating),
    (11, 'PARAGRAPH',    'Feedback on the content? How can we do better? (Confidential)', NULL, true, '{}'::jsonb),
    (12, 'CHECKBOXES',   'Stay connected', 'Select all that apply', true,
      '{"options": ["I would like access to course materials, presentations and new content from the course I attended", "I would like to be informed of more workshops like this online / offline", "I would like access to online courses/videos/resources and join as a paid member", "I would like to get more information about becoming a Vjal Institute Evangelist / Trainer", "Please contact me regarding membership for my organization"], "minSelections": 1}'::jsonb),
    (13, 'SHORT_ANSWER', 'Location', NULL, false, '{"urlParam": "location"}'::jsonb)
  ) AS q(ord, type, title, description, required, config);
END $$;
