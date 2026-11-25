/** The Jobs flow's instructions to Claude (spec: File Analysis Pipeline stage 3, Suggest Skills, Generate). */
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import type { FileFacts, SkillFileKind } from "../files/types";
import { JOB_LIMITS } from "../limits";
import { megabytes } from "./format";
import type { JobSkillDraft } from "./types";

export type PromptFile = { id: string; fileName: string; kind: SkillFileKind; size: number; analysis: string | null };
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

export const SUGGEST_SYSTEM = `You help a senior leader turn one recurring job into their own Agent Skills: folders of instructions and files that an AI assistant loads whenever the job comes up, so it is done their way every time.

From the job description, their answers, and the files they uploaded, propose the skills that capture this job:
- Usually exactly one skill. Propose more only when the job has clearly separate parts with different inputs, outputs or audiences.
- Never split one job into its steps, and never propose a skill for a one-off task.
- Never repeat a skill listed under already built; propose only genuinely different parts, or none.
- name: short kebab-case, for example board-update-deck.
- purpose: one sentence saying what the skill produces and when it is used.
- fileIds: the ids of the uploaded files this skill should reuse (templates it produces from, references it follows). Use only ids from the files list.

Use only what the person wrote and what the files show. Never invent facts about them, their company or their numbers.`;

export const GENERATE_JOB_SYSTEM = `You write one Agent Skill: a folder that AI assistants such as Claude, Cursor and Codex load when a task matches. It captures a recurring job exactly as this person does it today. Return the skill as structured fields; the server writes the files.

- description: what the skill does and when to use it, in one paragraph of at most 1000 characters, phrased so the assistant reliably picks it up. Name the situations, requests and phrases that should trigger it. Never use the characters < or >.
- body: the SKILL.md instructions in Markdown, in the imperative, ideally under 500 lines. Write the job's steps as the person does them today, with the inputs they start from and the output they hand over. Explain why each instruction matters rather than writing rigid ALWAYS or NEVER rules.
- Look and voice: tell the assistant to follow references/style-guide.md for colours, fonts, layouts, structure and tone whenever the skill uses files. Never write references/style-guide.md yourself: the server writes it from the file analyses.
- Templates: when a file is bundled at assets/<name> and is a template (a deck, document or workbook), tell the assistant to start from that file and reuse its masters, layouts, styles and theme rather than recreating the design. A file marked analysis only is not in the skill; rely on the style guide for it.
- Never reference a file that is not listed in the files section.
- references: other stable context (background about the person, team or domain, worked examples) as Markdown files under references/, loaded only when needed.
- scripts: include a script only when a deterministic, repeatable helper is clearly useful. Scripts must not make network calls and must not read credentials, keys, tokens or environment secrets. Give each script a one-line purpose.
- compatibility: tools or runtimes the skill needs, or an empty string.
- Paths are relative to the skill folder, for example references/board-context.md, using letters, digits, dots, dashes and underscores only.

Never invent facts about the person, their company or their numbers. Where context is missing (the gaps list), write clearly marked placeholders such as [Add the board's preferred metrics here] in a references/ file, and tell the reader in the body to fill them in.`;

/** Strips the characters that would end the attribute or the tag. */
const attrSafe = (value: string) => value.replace(/["<>&]/g, "").replace(/\s+/g, " ").trim();
const excerpt = (analysis: string | null) => (analysis?.trim() ? analysis.trim().slice(0, JOB_LIMITS.analysisExcerptChars) : null);

function answeredAndGaps(questions: PromptQuestionContext[]) {
  const relevant = questions.filter((q) => !q.notRelevant);
  const answered = relevant
    .filter((q) => q.answer.trim())
    .map((q) => `Q: ${q.text}\nA: ${q.answer.trim()}`)
    .join("\n\n");
  const gaps = relevant
    .filter((q) => q.score < 3)
    .map((q) => `- ${q.text} (${q.guidance})`)
    .join("\n");
  return { answered: answered || "(none)", gaps: gaps || "(none)" };
}

const jobSection = (title: string, description: string) => `<job>\ntitle: ${title.trim() || "(untitled)"}\n\n${description.trim()}\n</job>`;

export function buildAnalysisText(input: { fileName: string; kind: SkillFileKind; facts: FileFacts | null }): string {
  const facts = input.facts ? JSON.stringify(input.facts, null, 1) : "(none: read the file itself)";
  return [
    `<file name="${attrSafe(input.fileName)}" kind="${input.kind}">`,
    `<facts>\n${facts}\n</facts>`,
    "</file>",
    "Write the style guide for this file.",
  ].join("\n");
}

export function buildSuggestMessage(input: {
  title: string;
  description: string;
  questions: PromptQuestionContext[];
  files: PromptFile[];
  built: { name: string; purpose: string }[];
}): string {
  const { answered, gaps } = answeredAndGaps(input.questions);
  const files = input.files
    .map((f) => {
      const analysis = excerpt(f.analysis);
      return `- id: ${f.id}\n  name: ${attrSafe(f.fileName)}\n  kind: ${f.kind}\n  size: ${megabytes(f.size)}\n  <analysis>\n${analysis ?? "(no analysis yet)"}\n  </analysis>`;
    })
    .join("\n\n");
  const built = input.built.map((b) => `- ${b.name}: ${b.purpose}`).join("\n");
  return [
    jobSection(input.title, input.description),
    `<answers>\n${answered}\n</answers>`,
    `<gaps>\n${gaps}\n</gaps>`,
    `<files>\n${files || "(none)"}\n</files>`,
    `<already_built>\n${built || "(none)"}\n</already_built>`,
  ].join("\n\n");
}

function shippingText(file: ShippedFile): string {
  if (file.shipping === "bundled") return `bundled at ${file.path}`;
  return file.reason === "too-large" ? "analysis only (too large to bundle)" : "analysis only (over the 25 MB bundle budget)";
}

export function buildJobGenerateMessage(input: {
  title: string;
  description: string;
  questions: PromptQuestionContext[];
  skill: { name: string; purpose: string };
  files: ShippedFile[];
}): string {
  const { answered, gaps } = answeredAndGaps(input.questions);
  const files = input.files
    .map(
      (f) =>
        `<file name="${attrSafe(f.fileName)}" kind="${f.kind}" shipping="${shippingText(f)}">\n${f.analysis?.trim() || "No analysis available."}\n</file>`,
    )
    .join("\n\n");
  return [
    jobSection(input.title, input.description),
    `<answers>\n${answered}\n</answers>`,
    `<gaps>\n${gaps}\n</gaps>`,
    `<skill>\nname: ${input.skill.name}\npurpose: ${input.skill.purpose.trim()}\n</skill>`,
    `<files>\n${files || "(none)"}\n</files>`,
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
