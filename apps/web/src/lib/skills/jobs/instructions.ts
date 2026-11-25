/** The Skills Builder's instructions to Claude (jobs spec: File Analysis Pipeline stage 3, Suggest, Generate; tasks spec: Enhance, Questions). */
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import type { FileFacts, SkillFileKind } from "../files/types";
import { JOB_LIMITS } from "../limits";
import { megabytes } from "./format";
import type { JobSkillDraft, PerUseInput } from "./types";

/** questionId: the FIXED question the file answers; null (or a question not in the list) = a general file. */
export type PromptFile = { id: string; fileName: string; kind: SkillFileKind; size: number; analysis: string | null; questionId: string | null };
export type ShippedFile = PromptFile & ({ shipping: "bundled"; path: string } | { shipping: "analysis-only"; reason: "too-large" | "over-budget" });

export const ANALYSE_SYSTEM = `You write a style guide that another AI assistant will follow to produce new work that looks and reads exactly like the file you are given. The reader is that AI, not a person.

Write Markdown with these sections, in this order:
## Colours — every colour with its hex value and its role (headings, body text, accents, backgrounds, charts).
## Fonts — heading and body fonts, sizes and weights.
## Layout — slide size or page setup, masters and layouts or the page grid, margins and spacing.
## Structure — the order of slides, sections or sheets, recurring elements, tables and charts.
## Tone and content — voice, sentence length, terminology, how numbers are presented.
## Reusing this file — how to start from the original file instead of recreating it.

The facts were read from the file by a parser and are ground truth: use their hex values, font names and sizes exactly. Anything you only see in a PDF or an image and that is not in the facts must be marked "(approximate)". Never invent colours, fonts, numbers or names. Leave out a detail you cannot support rather than guess. Keep it to about 600 words. Output only the style guide.`;

export const SUGGEST_SYSTEM = `You help a senior leader turn one recurring task into their own Agent Skills: folders of instructions and files that an AI assistant loads whenever the task comes up, so it is done their way every time.

From the task description, the output type, each question with its answer and the files attached to it, and the general files, propose the skills that capture this task:
- Usually exactly one skill. Propose more only when the task has clearly separate parts with different inputs, outputs or audiences.
- Never split one task into its steps, and never propose a skill for a one-off piece of work.
- Never repeat a skill listed under already built; propose only genuinely different parts, or none.
- name: short kebab-case, for example board-update-deck.
- purpose: one sentence saying what the skill produces and when it is used.
- fileIds: the ids of the uploaded files this skill should reuse (templates it produces from, references it follows). Use only ids from the files listed.
- The inputs in <ask_each_time> change every run: the skill asks for them at the start of every run. They are never answered now and never decide how many skills there are.

Use only what the person wrote and what the files show. Never invent facts about them, their company or their numbers.`;

export const GENERATE_JOB_SYSTEM = `You write one Agent Skill: a folder that AI assistants such as Claude, Cursor and Codex load when a task matches. It captures a recurring task exactly as this person does it today. Return the skill as structured fields; the server writes the files.

- description: what the skill does and when to use it, in one paragraph of at most 1000 characters, phrased so the assistant reliably picks it up. Name the situations, requests and phrases that should trigger it. Never use the characters < or >.
- body: the SKILL.md instructions in Markdown, in the imperative, ideally under 500 lines. Write the task's steps as the person does them today, with the inputs they start from and the output they hand over. Explain why each instruction matters rather than writing rigid ALWAYS or NEVER rules. When <task> names an output_type, write for that kind of output.
- Questions: each question's answer and its files describe that part of the work; a file attached to a question shows what that answer looks like in practice. The fixed answers and their files become the skill's standing instructions and references.
- Per-use inputs: the inputs in <ask_each_time> change every time the skill runs. Never fill them in, guess them or invent values. Refer to them by their labels in the steps where they are used, for example "Put the client name on the cover". Do not write a "Before you start" section: the server adds it.
- Look and voice: tell the assistant to follow references/style-guide.md for colours, fonts, layouts, structure and tone whenever the skill uses files. Never write references/style-guide.md yourself: the server writes it from the file analyses.
- Templates: when a file is bundled at assets/<name> and is a template (a deck, document or workbook), tell the assistant to start from that file and reuse its masters, layouts, styles and theme rather than recreating the design. A file marked analysis only is not in the skill; rely on the style guide for it.
- Never reference a file that is not listed in the questions or the general files.
- references: other stable context (background about the person, team or domain, worked examples) as Markdown files under references/, loaded only when needed.
- scripts: include a script only when a deterministic, repeatable helper is clearly useful. Scripts must not make network calls and must not read credentials, keys, tokens or environment secrets. Give each script a one-line purpose.
- compatibility: tools or runtimes the skill needs, or an empty string.
- Paths are relative to the skill folder, for example references/board-context.md, using letters, digits, dots, dashes and underscores only.

Never invent facts about the person, their company or their numbers. Where context is missing (the gaps list), write clearly marked placeholders such as [Add the board's preferred metrics here] in a references/ file, and tell the reader in the body to fill them in.`;

// ---------------------------------------------------------------------------
// Tasks redesign (spec 2026-11-25 tasks): Enhance and Write questions
// ---------------------------------------------------------------------------

export const ENHANCE_TASK_SYSTEM = `You turn a person's description of one recurring task into a clear task brief. The brief is used next to write questions about the task and then to build an Agent Skill that does the task their way, so it must say plainly what they do.

Rewrite the description in <task> as Markdown with exactly these sections, in this order:
## Purpose — what the task produces and why it matters.
## When it's used — when the task comes up, and what it is not for.
## Same every time — what stays fixed on every run and defines the work's structure: document structure and sections, company standards, the template, clauses that always apply, brand assets, tone.
## Varies each time — what changes from one use to the next, as a short list: client name, date, project scope, deal value, contacts, deadlines, specific figures. Name only what varies for this task; each item becomes an input the skill asks for at the start of every run.
## Steps — a numbered list of the steps as they do them today.
## Output — what they hand over, its format, and what great looks like.
## Audience — who it is for.
## Quality bar — how they judge it is good enough.
## Constraints — rules, tools, limits and things to avoid.

Rules:
- Write in the first person ("I", "my team"), in plain words, 150 to 450 words.
- Keep every fact, number, name and tool they wrote.
- Never invent facts about them, their company, their clients or their numbers.
- Where a section has nothing to go on, write one short italic question under it instead, for example _Which file do you start from?_ They answer it in the next step.
- Every task gets the same sections, whatever the task is.
- Reply with the brief only, in the brief field.`;

export const QUESTIONS_SYSTEM = `You help a person turn one recurring task into an Agent Skill: instructions and files an AI assistant loads whenever the task comes up, so it is done their way every time. Read the task in <task> and write the questions you, Claude, would need answered to write an excellent skill for exactly this task, the way you would ask a skilled colleague: specific, one thing at a time, in the person's own words. Never ask what the description already answers fully.

Whatever the task is, always do all four of these:

(a) Work out the output type. Decide what the task produces, from this taxonomy: image or visual design; social post or carousel; video; audio or podcast; slide deck; document, report, contract or policy (for example an SLA, an ERP specification, a proposal); spreadsheet, financial model or data analysis; email or written copy; research or summary; code or automation; plan, process or checklist; or other. Name it in outputType as a short sentence-case label in the person's terms, for example "Instagram carousel", "client SLA document" or "monthly financial report". For other, still name the output, and ask what a skilled practitioner of it would need first.

(b) Ask for inputs and assets first. Ask the questions a skilled practitioner of that output would ask before starting, putting the required inputs and assets first. Wherever a file answers better than words, set wantsFiles to true, pick the fileHint (TEMPLATE for templates or design systems they produce from, REFERENCE for past examples or references to match, INPUT for typical input data, BRAND for logos, colours, fonts and brand guidelines) and write a specific fileNote saying what to upload, for example "Upload your logo files and brand colours." Otherwise set wantsFiles to false, fileHint to NONE and fileNote to "".

(c) Split what is fixed from what varies. Give every question a kind:
- kind "fixed": the same every time the skill runs, and it defines the work's structure: document structure and sections, company standards, the template, clauses that always apply, brand assets, tone. The person answers these now, with text and files, and they become the skill's standing instructions.
- kind "per_use": it varies from one use to the next: client name, date, project scope, deal value, contacts, deadlines, specific figures. Never ask the person to answer these now: the skill asks for them at the start of every run.
Also list in perUseInputs the per-use inputs you can infer from the description, each with a short label (for example "Client name", "Agreement date", "Service levels for this client"), a hint or example (or ""), and required (false when the skill can proceed without it). Do this the same way for every output type.

(d) Cover the skill essentials. Ask 5 to 8 fixed questions that, together with what the description already answers fully, cover all six, each phrased for this task, and list in covers the essentials each question covers:
- triggers: when the skill should be used, and when not.
- inputs: what it starts from.
- steps: how the work is done.
- output: what great looks like.
- quality: the bar it must meet.
- avoid: what it must never do.
First list in coveredByDescription every essential the description already answers fully. Never ask about those: it would make the person repeat themselves. Where the description covers something only in part, ask only for the missing part, for example "You mentioned the logo: upload the logo file."

Each question: text is one sentence ending in "?"; guidance is one sentence saying what a strong answer includes.

Short illustrations of the pattern follow. Adapt the idea to the task in front of you and never copy them. They are not a menu.
- An Instagram carousel needs the look (style, mood, references), the format (for example 1080×1350, slide count, safe areas), brand assets (logo files and placement, colours, fonts: BRAND), the images to use (INPUT), the copy per slide and the call to action, and past posts to match (REFERENCE).
- An explainer video needs its purpose and platform, duration and aspect ratio, the script or storyboard, footage and b-roll (INPUT), brand assets such as the logo and intro or outro (BRAND), voice-over, music and captions, videos to match (REFERENCE), and the output resolution.
- A client SLA document needs the template (TEMPLATE), the standard sections and clauses that always apply, company standards and past signed examples (REFERENCE), while the client name, dates and service levels vary per use.
- A monthly financial report needs the report template (TEMPLATE), the data sources and exports (INPUT), the KPIs and structure and past reports (REFERENCE), while the month and its figures vary per use.

When <existing_questions> are given, these are the task's current questions ("(answered)" marks those with an answer). For every one that still fits, keep its exact wording, so its answer is kept; change or drop the rest.

Never invent facts about the person, their company, their clients or their numbers.`;

/** Strips the characters that would end the attribute or the tag. */
const attrSafe = (value: string) => value.replace(/["<>&]/g, "").replace(/\s+/g, " ").trim();
const excerpt = (analysis: string | null) => (analysis?.trim() ? analysis.trim().slice(0, JOB_LIMITS.analysisExcerptChars) : null);

export function buildAnalysisText(input: { fileName: string; kind: SkillFileKind; facts: FileFacts | null }): string {
  const facts = input.facts ? JSON.stringify(input.facts, null, 1) : "(none: read the file itself)";
  return [
    `<file name="${attrSafe(input.fileName)}" kind="${input.kind}">`,
    `<facts>\n${facts}\n</facts>`,
    "</file>",
    "Write the style guide for this file.",
  ].join("\n");
}

/** Questions scored below 3, with their guidance. */
function gapsText(questions: PromptQuestionContext[]): string {
  const gaps = questions
    .filter((q) => !q.notRelevant && q.score < 3)
    .map((q) => `- ${q.text} (${q.guidance})`)
    .join("\n");
  return gaps || "(none)";
}

/** The per-use inputs, said to be asked at every run (spec 2026-11-25 tasks, Step 3). */
function askEachTimeSection(perUse: PerUseInput[]): string {
  if (perUse.length === 0) return "<ask_each_time>\n(none)\n</ask_each_time>";
  const lines = perUse.map((p) => `- ${p.label.trim()} (${p.required ? "required" : "if available"})${p.hint.trim() ? `: ${p.hint.trim()}` : ""}`);
  return [
    "<ask_each_time>",
    "These change every run: the skill asks for them at the start of every run. They are never answered now.",
    ...lines,
    "</ask_each_time>",
  ].join("\n");
}

/** Splits files between the questions they answer (in question order) and the general files. */
function byQuestion<F extends { questionId: string | null }>(questions: PromptQuestionContext[], files: F[]) {
  const ids = new Set(questions.map((q) => q.id));
  return {
    of: (questionId: string) => files.filter((f) => f.questionId === questionId),
    general: files.filter((f) => !f.questionId || !ids.has(f.questionId)),
  };
}

function questionBlocks<F extends { questionId: string | null }>(questions: PromptQuestionContext[], files: F[], render: (own: F[]) => string): string {
  const groups = byQuestion(questions, files);
  const blocks = questions
    .filter((q) => !q.notRelevant)
    .map((q, i) => {
      const own = render(groups.of(q.id));
      return [`<question n="${i + 1}" text="${attrSafe(q.text)}">`, `<answer>\n${q.answer.trim() || "(not answered yet)"}\n</answer>`, ...(own ? [own] : []), "</question>"].join("\n");
    });
  return `<questions>\n${blocks.join("\n\n") || "(none)"}\n</questions>`;
}

type TaskPromptInput = {
  title: string;
  description: string;
  outputType: string | null;
  /** FIXED questions with their answers, in order. */
  questions: PromptQuestionContext[];
  perUse: PerUseInput[];
};

const suggestFileLine = (f: PromptFile) =>
  `- id: ${f.id}\n  name: ${attrSafe(f.fileName)}\n  kind: ${f.kind}\n  size: ${megabytes(f.size)}\n  <analysis>\n${excerpt(f.analysis) ?? "(no analysis yet)"}\n  </analysis>`;

export function buildSuggestMessage(input: TaskPromptInput & { files: PromptFile[]; built: { name: string; purpose: string }[] }): string {
  const general = byQuestion(input.questions, input.files).general;
  const built = input.built.map((b) => `- ${b.name}: ${b.purpose}`).join("\n");
  return [
    taskSection(input.title, input.description, input.outputType),
    questionBlocks(input.questions, input.files, (own) => (own.length > 0 ? `<files>\n${own.map(suggestFileLine).join("\n\n")}\n</files>` : "")),
    `<general_files>\n${general.map(suggestFileLine).join("\n\n") || "(none)"}\n</general_files>`,
    `<gaps>\n${gapsText(input.questions)}\n</gaps>`,
    askEachTimeSection(input.perUse),
    `<already_built>\n${built || "(none)"}\n</already_built>`,
  ].join("\n\n");
}

function shippingText(file: ShippedFile): string {
  if (file.shipping === "bundled") return `bundled at ${file.path}`;
  return file.reason === "too-large" ? "analysis only (too large to bundle)" : "analysis only (over the 25 MB bundle budget)";
}

const generateFileTag = (f: ShippedFile) =>
  `<file name="${attrSafe(f.fileName)}" kind="${f.kind}" shipping="${shippingText(f)}">\n${f.analysis?.trim() || "No analysis available."}\n</file>`;

export function buildJobGenerateMessage(input: TaskPromptInput & { skill: { name: string; purpose: string }; files: ShippedFile[] }): string {
  const general = byQuestion(input.questions, input.files).general;
  return [
    taskSection(input.title, input.description, input.outputType),
    questionBlocks(input.questions, input.files, (own) => own.map(generateFileTag).join("\n\n")),
    `<general_files>\n${general.map(generateFileTag).join("\n\n") || "(none)"}\n</general_files>`,
    `<gaps>\n${gapsText(input.questions)}\n</gaps>`,
    askEachTimeSection(input.perUse),
    `<skill>\nname: ${input.skill.name}\npurpose: ${input.skill.purpose.trim()}\n</skill>`,
  ].join("\n\n");
}

export function buildJobRetryMessage(original: string, draft: JobSkillDraft, errors: string[]): string {
  return [
    original,
    `<previous_attempt>\n${JSON.stringify(draft)}\n</previous_attempt>`,
    `<validation_errors>\n${errors.map((e) => `- ${e}`).join("\n")}\n</validation_errors>`,
    "Your previous attempt failed the checks above. Return the complete skill again with every error fixed.",
  ].join("\n\n");
}

/** The task block every task message starts with; output_type is added once questions have named it. */
function taskSection(title: string, description: string, outputType?: string | null): string {
  const type = outputType?.trim() ? `\noutput_type: ${outputType.trim()}` : "";
  return `<task>\ntitle: ${title.trim() || "(untitled)"}${type}\n\n${description.trim()}\n</task>`;
}

export function buildEnhanceTaskMessage(input: { title: string; description: string }): string {
  return `${taskSection(input.title, input.description)}\n\nRewrite this description as the task brief.`;
}

export type ExistingQuestionLine = { kind: "FIXED" | "PER_USE"; text: string; answered: boolean };

export function buildQuestionsMessage(input: { title: string; description: string; existing: ExistingQuestionLine[] }): string {
  const parts = [taskSection(input.title, input.description)];
  if (input.existing.length > 0) {
    const lines = input.existing.map((q) => `- [${q.kind === "FIXED" ? "fixed" : "per_use"}] ${q.text}${q.answered ? " (answered)" : ""}`);
    parts.push(`<existing_questions>\n${lines.join("\n")}\n</existing_questions>`);
  }
  parts.push(input.existing.length > 0 ? "Write the questions for this task again." : "Write the questions for this task.");
  return parts.join("\n\n");
}
