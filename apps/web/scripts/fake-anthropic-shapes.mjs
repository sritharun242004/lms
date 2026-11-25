// Canned replies of the fake Anthropic API (scripts/fake-anthropic.mjs) for the Skills Builder tasks flow,
// kept in their own module so Vitest can check them against the real schemas (spec 2026-11-25 tasks, Testing).
// Nothing here is per-type product logic: these are test fixtures for five kinds of task.

/** Five task descriptions (each at least 500 characters) that pick the five canned replies. */
export const TASK_DESCRIPTIONS = {
  carousel:
    "Every week I make an Instagram carousel for our coffee roastery's account. I use it whenever we launch a new single-origin bean or run a brewing tip series, never for paid ads. I start from a topic, pick five to eight photos from our shoot folder, write a hook for the first slide, one idea per slide and a call to action on the last one. Everything has to look like our brand: warm, minimal, lots of white space, our logo small in the corner. I export each slide as a PNG and schedule the post in Later. It usually takes me two hours.",
  video:
    "Twice a month I produce a short explainer video for our accounting software's help centre and YouTube channel. It is used when we ship a feature customers ask about, not for marketing launches. I write a script from the release notes, record the screen in Loom, add a voice-over, captions and our intro and outro, and cut it to about ninety seconds. It has to be clear for small business owners who are not accountants, friendly and never salesy. I edit it in Descript and export it in 1080p for YouTube and a square version for LinkedIn.",
  sla:
    "Whenever we sign a new client I write a client SLA document for our managed IT services. It is used once the commercial deal is agreed and before onboarding starts. I start from our Word SLA template, keep our standard sections (scope, service hours, response and resolution times, escalation, service credits, exclusions, review) and the clauses that always apply, then fill in the client's details and the service levels we agreed. Legal reviews it before it goes out. It has to be precise, consistent with our master services agreement and written in plain English.",
  finance:
    "At every month-end I prepare the monthly financial report for our leadership team. It is used in the first week of each month, before the leadership meeting. I export the trial balance and the sales ledger from Xero, update our Excel model, check the numbers against the bank, and write a two-page report: headline numbers, revenue against budget, gross margin, cash and runway, and the three things leadership should know. It goes out as a PDF with the workbook attached. It has to be accurate, consistent month to month and readable in five minutes.",
  other:
    "For each client dinner we host I put together a client dinner wine list for the restaurant team. It is used when a sales director books one of our private dining evenings for clients, not for staff events. I look at the menu the chef sends, the guests' preferences and the budget, choose a sparkling wine, two whites, two reds and a dessert wine, and write a short tasting note for each. The list is printed on our card stock and placed on the table. It has to suit the food, stay within budget and feel personal without being pretentious.",
};

const KINDS = ["carousel", "video", "sla", "finance", "other"];

/** The text inside the message's <task> block (the description and title only). */
function taskBlock(user) {
  const match = /<task>([\s\S]*?)<\/task>/.exec(user);
  return (match ? match[1] : user).toLowerCase();
}

/** Picks the canned reply by keywords in the <task> block. */
export function taskKind(user) {
  const task = taskBlock(user);
  if (/carousel|instagram/.test(task)) return "carousel";
  if (/video/.test(task)) return "video";
  if (/\bsla\b|service level/.test(task)) return "sla";
  if (/financial|finance|month-end/.test(task)) return "finance";
  return "other";
}

const q = (text, guidance, covers, file = null) => ({
  text,
  guidance,
  kind: "fixed",
  wantsFiles: Boolean(file),
  fileHint: file ? file.hint : "NONE",
  fileNote: file ? file.note : "",
  covers,
});
const perUseQ = (text, guidance) => ({ text, guidance, kind: "per_use", wantsFiles: false, fileHint: "NONE", fileNote: "", covers: [] });

// Each reply: an outputType, fixed questions with at least one asset question (wantsFiles + a specific hint and note),
// one per_use question, perUseInputs, and "avoid" left uncovered so the server appends "What should it never do?".
const REPLIES = {
  carousel: {
    outputType: "Instagram carousel",
    coveredByDescription: ["triggers"],
    questions: [
      q("What look should every carousel have?", "Describe the style, mood and colours, with an account or post you like.", ["output"]),
      q("Which format do you post in?", "Give the size (for example 1080×1350), the usual slide count and the safe areas for text.", ["output", "quality"]),
      q("Which brand assets go on every slide?", "List the logo files and where the logo sits, your colours and your fonts.", ["inputs"], { hint: "BRAND", note: "Upload your logo files and brand colours." }),
      q("Which photos do you usually choose from?", "Say where the shoot folder is and what makes a photo right for a slide.", ["inputs"], { hint: "INPUT", note: "Upload a few photos you would use." }),
      q("Which past posts should new carousels match?", "Pick two or three of your best carousels.", ["quality"], { hint: "REFERENCE", note: "Upload two or three past carousels as images." }),
      q("How do you write the copy on each slide and the call to action?", "Describe the hook, one idea per slide and the last-slide call to action.", ["steps"]),
      perUseQ("Topic of this post", "e.g. our new Ethiopian single origin"),
    ],
    perUseInputs: [
      { label: "Slide copy", hint: "The text for each slide, if you have it already", required: false },
      { label: "Posting date", hint: "e.g. Friday 6 March", required: true },
    ],
  },
  video: {
    outputType: "explainer video",
    coveredByDescription: ["triggers", "output"],
    questions: [
      q("Where is each video published, and in which aspect ratios?", "Name the platforms and the sizes you export.", ["output"]),
      q("Do you start from a script or a storyboard?", "Describe how you turn release notes into a script.", ["steps"], { hint: "TEMPLATE", note: "Upload a script or storyboard template." }),
      q("What footage and b-roll do you record?", "Describe the screen recordings and any other clips.", ["inputs"], { hint: "INPUT", note: "Upload a short screen recording you used." }),
      q("Which brand assets appear in every video?", "List the logo, the intro and outro, colours and fonts.", ["inputs"], { hint: "BRAND", note: "Upload your intro, outro and logo files." }),
      q("How do you handle voice-over, music and captions?", "Say who records the voice-over, which music you use and how captions look.", ["steps"]),
      q("Which past videos should new ones match?", "Pick one or two you are proud of.", ["quality"], { hint: "REFERENCE", note: "Upload a past video or a link list as a PDF." }),
      perUseQ("Feature this video explains", "e.g. bank feeds for Monzo"),
    ],
    perUseInputs: [{ label: "Release notes", hint: "The notes for this feature", required: true }],
  },
  sla: {
    outputType: "client SLA document",
    coveredByDescription: ["triggers"],
    questions: [
      q("Which SLA template do you start from?", "Name the file and its version.", ["inputs"], { hint: "TEMPLATE", note: "Upload your SLA template." }),
      q("Which standard sections and clauses always apply?", "List the clauses that never change between clients.", ["steps", "output"]),
      q("Which company standards must every SLA follow?", "Mention the master services agreement terms and house style.", ["quality"]),
      q("Which signed SLAs are good examples?", "Pick one or two recent signed SLAs.", ["quality"], { hint: "REFERENCE", note: "Upload one or two past signed SLAs." }),
      q("What does legal check before it goes out?", "Describe the review step and what they look for.", ["steps"]),
      perUseQ("Client name", "e.g. Acme Ltd"),
    ],
    perUseInputs: [
      { label: "Agreement date", hint: "", required: true },
      { label: "Service levels for this client", hint: "Response and resolution times agreed", required: true },
      { label: "Deal value", hint: "in GBP", required: false },
    ],
  },
  finance: {
    outputType: "monthly financial report",
    coveredByDescription: ["triggers"],
    questions: [
      q("Which report template do you fill in each month?", "Name the document and the sections it has.", ["output"], { hint: "TEMPLATE", note: "Upload your report template." }),
      q("Which data exports do you start from?", "List the Xero exports and the Excel model.", ["inputs"], { hint: "INPUT", note: "Upload last month's exports and the workbook." }),
      q("Which KPIs and structure must every report keep?", "List the KPIs and the order they appear in.", ["output"]),
      q("How do you check the numbers before sending?", "Describe the reconciliation against the bank and any other checks.", ["quality"]),
      q("Which past reports should new ones match?", "Pick one or two recent reports leadership liked.", ["quality"], { hint: "REFERENCE", note: "Upload one or two past reports." }),
      q("What are the steps from export to PDF?", "Describe the order you work in.", ["steps"]),
      perUseQ("Month being reported", "e.g. March 2026"),
    ],
    perUseInputs: [{ label: "This month's figures", hint: "The trial balance and sales ledger exports", required: true }],
  },
  other: {
    outputType: "client dinner wine list",
    coveredByDescription: ["triggers"],
    questions: [
      q("How do you choose a wine for each course?", "Describe how you match wine to the chef's dishes.", ["steps"]),
      q("What does the printed card look like?", "Describe the card stock, layout and fonts.", ["output"], { hint: "TEMPLATE", note: "Upload your wine list card design." }),
      q("Which past wine lists went down well?", "Pick one or two lists guests liked.", ["quality"], { hint: "REFERENCE", note: "Upload one or two past wine lists." }),
      q("What do you need from the chef and the sales director first?", "List the menu, guest preferences and budget details.", ["inputs"]),
      q("How do you write a tasting note?", "Give the length and the tone you aim for.", ["output", "quality"]),
      perUseQ("Guests' preferences", "e.g. no red wine for two guests"),
    ],
    perUseInputs: [
      { label: "Menu for this dinner", hint: "The chef's menu", required: true },
      { label: "Budget per bottle", hint: "e.g. up to £60", required: true },
    ],
  },
};

const REGENERATED_TAIL = [
  "Which detail do people most often get wrong?",
  "Who signs it off before it is shared?",
  "How long should the finished piece take to read or watch?",
  "Which tools do you use for the final step?",
];

/** Write questions: the canned reply for the task's kind. On regenerate the first three fixed texts repeat verbatim. */
export function questionsReply(user) {
  const kind = taskKind(user);
  const base = REPLIES[kind];
  const regenerate = user.includes("<existing_questions>");
  if (!regenerate) return { kind, regenerate, reply: structuredClone(base) };
  let fixed = 0;
  const questions = base.questions.map((question) => {
    if (question.kind !== "fixed") return { ...question };
    fixed += 1;
    if (fixed <= 3) return { ...question };
    return { ...question, text: REGENERATED_TAIL[(fixed - 4) % REGENERATED_TAIL.length], wantsFiles: false, fileHint: "NONE", fileNote: "" };
  });
  return { kind, regenerate, reply: { ...structuredClone(base), questions } };
}

/** Enhance: a brief of about 700 characters in the spec's sections, with the fixed and the varying parts apart. */
export function enhanceReply(user) {
  const kind = taskKind(user);
  const output = REPLIES[kind].outputType;
  const brief = [
    "## Purpose",
    `I produce a ${output} that my team can use straight away, done the same way every time.`,
    "## When it's used",
    "Whenever this piece of work comes up in my week. _Is there any time it should not be used?_",
    "## Same every time",
    "The structure and sections, our company standards, the template I start from, our brand assets and the tone.",
    "## Varies each time",
    "- Who it is for\n- The date\n- The specific figures or details for this one",
    "## Steps",
    "1. Gather what I need.\n2. Start from the template.\n3. Write and check it.\n4. Share it.",
    "## Output",
    `One finished ${output}. _Which file format do you hand over?_`,
    "## Audience",
    "My team and the people we produce it for.",
    "## Quality bar",
    "Accurate, on brand and ready to share without edits.",
    "## Constraints",
    "_What should it never do?_",
  ].join("\n\n");
  return { kind, brief };
}

/** The fake generate draft: valid, but its body carries its own "Before you start" and "How this skill works" sections
 * (a model ignoring the instructions), which the server must replace with exactly one server-written copy of each. */
export const JOB_DRAFT = {
  description:
    'Writes the monthly board update from rough notes and this month\'s numbers, in the house style: numbers first, "no surprises". Use when asked for a board update, an investor update or a monthly summary deck.',
  compatibility: "",
  body:
    "# Board update writer\n\n## Before you start — ask the user for\n\n- The model's own list, which the server replaces\n\n## How this skill works\n\n1. A model-written workflow, which the server replaces with its own.\n\nRead `references/company-context.md` before writing, because the board expects the same framing every month.\n\n1. Ask for this month's numbers if they are missing.\n2. Draft the update, then run `scripts/word_count.py` on it and keep it under 400 words.\n3. Build the deck from the bundled template and follow `references/style-guide.md` for colours and fonts.\n",
  references: [
    { path: "company-context.md", content: "# Company context\n\n[Add your company's tone of voice here]\n" },
    // The server writes references/style-guide.md itself and must drop this one.
    { path: "style-guide.md", content: "# A style guide the model should not have written\n" },
  ],
  scripts: [{ path: "scripts/word_count.py", content: "import sys\nprint(len(sys.stdin.read().split()))\n", purpose: "Counts the words in a draft read from standard input." }],
};

const sub = (name, label, purpose, focus, step) => ({ name, label, purpose, focus, step });
/** Suggest (plugins): one main skill and three sub-skills per kind. "other" repeats a sub name to exercise clean-up. */
const PLUGINS = {
  carousel: {
    main: { name: "instagram-carousel", label: "Instagram carousel", purpose: "Use to make a weekly Instagram carousel for the roastery, from topic to scheduled post." },
    subSkills: [
      sub("carousel-designer", "Slide design", "Use to lay out carousel slides in the brand look.", "Only the slide layout and visuals; leaves copy and scheduling to the main skill.", "Lay out the slides in the brand look"),
      sub("caption-writer", "Captions", "Use to write the hook, slide copy and caption.", "Only the words; leaves the design to the main skill.", "Write the hook, slide copy and caption"),
      sub("hashtag-check", "Hashtag check", "Use to check hashtags and the call to action before posting.", "Only the final checks; leaves fixes to the main skill.", "Check hashtags and the call to action"),
    ],
  },
  video: {
    main: { name: "explainer-video", label: "Explainer video", purpose: "Use to produce a ninety-second feature explainer video from release notes." },
    subSkills: [
      sub("script-writer", "Script", "Use to write the explainer script from release notes.", "Only the script; leaves recording and editing to the main skill.", "Write the script from the release notes"),
      sub("video-editor", "Edit", "Use to plan the cut, captions, intro and outro.", "Only the edit plan; leaves the script to the main skill.", "Plan the cut, captions, intro and outro"),
      sub("clarity-check", "Clarity check", "Use to check the video is clear for non-accountants.", "Only the review; leaves fixes to the main skill.", "Check it is clear and never salesy"),
    ],
  },
  sla: {
    main: { name: "client-sla", label: "Client SLA", purpose: "Use to write a client SLA document from the Word template once a deal is agreed." },
    subSkills: [
      sub("sla-drafter", "Draft", "Use to fill the template with the client's details and service levels.", "Only the drafting; leaves the legal check to the main skill.", "Fill the template for this client"),
      sub("clause-check", "Clause check", "Use to check the standard clauses and the master services agreement.", "Only the clause review; leaves drafting to the main skill.", "Check the clauses against the MSA"),
      sub("sla-formatter", "Formatting", "Use to apply the template's formatting before legal review.", "Only the formatting; leaves the wording to the main skill.", "Apply the template's formatting"),
    ],
  },
  finance: {
    main: { name: "monthly-financial-report", label: "Monthly report", purpose: "Use at month-end to prepare the leadership financial report and workbook." },
    subSkills: [
      sub("ledger-analyzer", "Ledger analysis", "Use to analyse the trial balance and sales ledger exports.", "Only the analysis; leaves the writing to the main skill.", "Analyse the ledger exports"),
      sub("report-writer", "Report", "Use to write the two-page report from the numbers.", "Only the writing; leaves the numbers to the main skill.", "Write the two-page report"),
      sub("numbers-check", "Numbers check", "Use to check the figures against the bank and last month.", "Only the checks; leaves fixes to the main skill.", "Check the numbers before sending"),
    ],
  },
  other: {
    main: { name: "client-dinner-wine-list", label: "Wine list", purpose: "Use to put together the wine list for a client dinner." },
    subSkills: [
      sub("wine-picker", "Wine picks", "Use to choose wines that suit the menu and budget.", "Only the choice of wines; leaves the notes to the main skill.", "Choose the wines"),
      sub("tasting-notes", "Tasting notes", "Use to write a short tasting note per wine.", "Only the notes; leaves the choice to the main skill.", "Write the tasting notes"),
      sub("tasting-notes", "Duplicate", "A repeated name, to check that names are made unique.", "Only a duplicate.", "Check the duplicate"),
    ],
  },
};

/** The plugin suggestion for this task: the main skill reuses every file id (plus an unknown one), the first sub-skill the first. */
export function pluginSuggestionReply(user) {
  const kind = taskKind(user);
  const ids = [...new Set([...user.matchAll(/- id: (\S+)/g)].map((m) => m[1]))];
  const base = PLUGINS[kind];
  return {
    kind,
    reply: {
      main: { ...base.main, fileIds: [...ids, "file_that_does_not_exist"] },
      subSkills: base.subSkills.map((s, i) => ({ ...s, fileIds: i === 0 ? ids.slice(0, 1) : [] })),
    },
  };
}

/** The sub-skill named in the message's <sub_skill> block, or null for a main or single skill. */
export function subSkillName(user) {
  const match = /<sub_skill>\nname: (\S+)/.exec(user);
  return match ? match[1] : null;
}

/** A valid, short sub-skill draft for `name`, with its own reference file. */
export function subSkillDraft(name) {
  const title = name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return {
    description: `Does just the ${name.replace(/-/g, " ")} part of this task, on its own or as a step of the main skill. Use when asked for ${name.replace(/-/g, " ")}.`,
    compatibility: "",
    body: `# ${title}\n\n1. Read \`references/${name}-checklist.md\`, because it lists what this part must get right.\n2. Do this part from the request and the files given.\n3. Check the result against the checklist and list any fixes.\n`,
    references: [{ path: `${name}-checklist.md`, content: `# ${title} checklist\n\n- [Add what this part must get right here]\n` }],
    scripts: [],
  };
}

export { KINDS };
