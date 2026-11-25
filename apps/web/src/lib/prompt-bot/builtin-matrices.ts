/**
 * Built-in question matrices. `core` and `image` are verbatim from the
 * institute's Design Think decks; the other task matrices are drafts the
 * institute edits in /prompt-bot/matrices (spec, 2026-11-24).
 *
 * Prompt Bot asks only the active core questions: the deck's seven, then
 * "Finally: What is the systematic plan to work on this?". Retired rows stay in
 * the database, switched off (`isActive: false`), so stored answers keep their
 * question. 20261124150000_add_prompt_bot seeds every row as active;
 * 20261125090000_prompt_bot_core_seven switches the retired ones off (it also
 * switched off pbq_core_8 by mistake); 20261125090500_prompt_bot_core_eighth
 * switches pbq_core_8 back on (scripts/prompt-bot-seed-sql.ts prints all three).
 */
export type BuiltinQuestion = { id: string; text: string; guidance: string; element: string | null; isActive?: boolean };
export type BuiltinMatrix = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: "CORE" | "TASK" | "SKILL";
  /** Omitted means active. */
  isActive?: boolean;
  questions: BuiltinQuestion[];
};

export const activeQuestions = (matrix: BuiltinMatrix) => matrix.questions.filter((q) => q.isActive !== false);

export const CORE_MATRIX_ID = "pbm_core";

const q = (matrix: string, n: number, text: string, guidance: string, element: string | null = null): BuiltinQuestion => ({
  id: `pbq_${matrix}_${n}`,
  text,
  guidance,
  element,
});

export const BUILTIN_MATRICES: BuiltinMatrix[] = [
  {
    id: CORE_MATRIX_ID,
    slug: "core",
    name: "Design Think",
    description: "The core questions every prompt should answer.",
    kind: "CORE",
    questions: [
      q("core", 1, "Why are we doing this?", "The underlying reason or problem, and why it matters now.", "goal"),
      q("core", 2, "What is going on in the background (Context)?", "Relevant situation: organisation, constraints, history, what has been tried.", "context"),
      q("core", 3, "Who is the target audience?", "Who will read or use the output, how specifically they are described, and what they care about.", "persona"),
      q("core", 4, "What is needed to do this?", "Inputs, data, resources, tools or access the AI or person needs.", "data"),
      q("core", 5, "What are the goals and objectives & How do we measure them?", "Concrete objectives and how success will be measured.", "goal"),
      q("core", 6, "What are the different ways we can approach this?", "Options or angles considered, or permission for the AI to propose options.", "iteration"),
      q("core", 7, "What does success look like?", "A description of the ideal finished output: format, length, tone and quality bar.", "output"),
      q("core", 8, "What is the systematic plan to work on this?", "Steps or sequence, including iteration such as asking clarifying questions first.", "plan"),
    ],
  },
  {
    id: "pbm_image",
    slug: "image",
    name: "Image",
    description: "Creating an image, graphic, illustration or visual.",
    kind: "TASK",
    isActive: false,
    questions: [
      q("image", 1, "Why do we need this image?", "The purpose the image serves and the decision or action it supports."),
      q("image", 2, "What is the full context?", "Where it sits: campaign, document, brand, surrounding content and constraints."),
      q("image", 3, "Who is the target audience?", "Who will see it and what they already know or expect."),
      q("image", 4, "What are we trying to express/show using this image?", "The subject, message or idea the image must show clearly."),
      q("image", 5, "What are we trying to get people to feel/take away when they see this image?", "The emotion or single takeaway the viewer should leave with."),
      q("image", 6, "Where will this image be published?", "Channel, format, size or aspect ratio, and any brand or platform rules."),
    ],
  },
  {
    id: "pbm_presentation",
    slug: "presentation",
    name: "Presentation",
    description: "Slide decks, pitches, board or team presentations.",
    kind: "TASK",
    isActive: false,
    questions: [
      q("presentation", 1, "What decision or action should the audience take after this presentation?", "The specific decision, approval or action expected at the end."),
      q("presentation", 2, "What does the audience already know, and what do they doubt?", "Their starting knowledge, objections and concerns."),
      q("presentation", 3, "What is the one key message?", "A single sentence the audience must remember."),
      q("presentation", 4, "What evidence, data or stories support it?", "Facts, figures, examples or cases available to use."),
      q("presentation", 5, "How long is the slot and how many slides?", "Time available and target slide count."),
      q("presentation", 6, "What brand or visual style applies?", "Template, colours, tone and any visual rules."),
    ],
  },
  {
    id: "pbm_writing",
    slug: "writing",
    name: "Writing",
    description: "Emails, posts, articles, announcements and other written pieces.",
    kind: "TASK",
    isActive: false,
    questions: [
      q("writing", 1, "What should the reader do or feel after reading?", "The action or reaction the piece must produce."),
      q("writing", 2, "Who exactly is the reader and what is your relationship?", "The reader's role, seniority and relationship to the writer."),
      q("writing", 3, "What tone and voice should it have?", "Formality, warmth, confidence and any voice rules."),
      q("writing", 4, "What length and format?", "Word count or length, structure and channel format."),
      q("writing", 5, "What must be included or avoided?", "Mandatory points, facts, links, and topics or phrases to avoid."),
      q("writing", 6, "Is there an example of writing you like?", "A sample or description of a style to match."),
    ],
  },
  {
    id: "pbm_strategy",
    slug: "strategy",
    name: "Strategy",
    description: "Plans, decisions, strategy and prioritisation.",
    kind: "TASK",
    isActive: false,
    questions: [
      q("strategy", 1, "What decision or plan is needed, and by when?", "The decision to make or plan to produce, and the deadline."),
      q("strategy", 2, "What constraints apply (budget, people, time)?", "Hard limits on money, people, time or technology."),
      q("strategy", 3, "Which options are on the table?", "Alternatives already considered, or none yet."),
      q("strategy", 4, "What criteria decide between them?", "How options will be judged and weighted."),
      q("strategy", 5, "What risks worry you most?", "The main risks and what failure would look like."),
      q("strategy", 6, "Who must agree?", "Stakeholders whose approval or buy-in is needed."),
    ],
  },
  {
    id: "pbm_code",
    slug: "code",
    name: "Code",
    description: "Software, automation and technical work.",
    kind: "TASK",
    isActive: false,
    questions: [
      q("code", 1, "What should the software do, for whom?", "The behaviour required and who uses it."),
      q("code", 2, "What stack, environment or existing code is involved?", "Languages, frameworks, versions, systems and existing code."),
      q("code", 3, "What are the inputs and outputs?", "Data coming in, results going out, and their formats."),
      q("code", 4, "What edge cases and errors matter?", "Unusual inputs, failures and how they must be handled."),
      q("code", 5, "How will we know it works (tests, acceptance criteria)?", "Tests or acceptance criteria that prove it is done."),
      q("code", 6, "What must it not do (security, performance limits)?", "Security, privacy, performance and compliance constraints."),
    ],
  },
  {
    id: "pbm_research",
    slug: "research",
    name: "Research",
    description: "Investigating, analysing and summarising information.",
    kind: "TASK",
    isActive: false,
    questions: [
      q("research", 1, "What question must the research answer?", "The precise question and the decision it informs."),
      q("research", 2, "What scope, period and geography?", "Boundaries: topics, time range and regions."),
      q("research", 3, "Which sources are trusted or excluded?", "Preferred, required and forbidden sources."),
      q("research", 4, "How deep: overview or detailed analysis?", "Depth and level of detail expected."),
      q("research", 5, "What format should the findings take?", "Report, table, bullets or brief, and its length."),
      q("research", 6, "How should uncertainty be reported?", "How to flag confidence, gaps and conflicting evidence."),
    ],
  },
  {
    id: "pbm_data",
    slug: "data",
    name: "Data analysis",
    description: "Analysing data, metrics, spreadsheets and reports.",
    kind: "TASK",
    isActive: false,
    questions: [
      q("data", 1, "What question should the data answer?", "The business question behind the analysis."),
      q("data", 2, "What data is available and in what shape?", "Sources, columns, size, quality and format."),
      q("data", 3, "Which metrics or definitions apply?", "How key metrics are defined and calculated."),
      q("data", 4, "What comparisons or segments matter?", "Periods, groups or benchmarks to compare."),
      q("data", 5, "What output: table, chart, narrative?", "The form of the result and its level of detail."),
      q("data", 6, "Who will act on the result?", "The decision-maker and what they will do with it."),
    ],
  },
];
