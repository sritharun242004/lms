/** Skills Builder's instructions to Claude (spec, Flow and Contracts). */
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import type { SkillDraft } from "./assemble";

export const SPLIT_SYSTEM = `You help a professional turn their work into reusable AI skills. A skill is a packaged set of context and instructions that an AI assistant loads when a matching task comes up, so the person never has to re-explain it.

From the work description (and the role, if given), return:
1. customSkills: up to 8 distinct, reusable skills worth building for this person. Each has a short kebab-case name (for example board-update-writer) and a one-sentence purpose that says what it produces and when it is used. Prefer one skill per recurring job. Do not split one job into its steps, and do not propose skills for one-off tasks.
2. catalogMatches: existing public skills from the catalog that would genuinely help, as a slug and a one-sentence why tied to their work. Use only slugs from the catalog list. Return an empty list when none fit.

Use only what the person wrote. Never invent facts about them, their company or their numbers.`;

export const GENERATE_SYSTEM = `You write Agent Skills: folders that AI assistants such as Claude, Cursor and Codex load when a task matches. Return the skill as structured fields; the server writes the files.

- description: what the skill does and when to use it, in one paragraph of at most 1000 characters, phrased so the assistant reliably picks it up. Name the situations, requests and phrases that should trigger it. Never use the characters < or >.
- body: the SKILL.md instructions in Markdown, in the imperative, ideally under 500 lines. Explain why each instruction matters rather than writing rigid ALWAYS or NEVER rules. Point to every reference, script and asset by its path and say when to read or use it.
- references: stable context (background about the person, team, company or domain, style guides, worked examples) as Markdown files under references/, which are loaded only when needed. Put stable context here, not in the body.
- scripts: include a script only when a deterministic, repeatable helper is clearly useful. Scripts must not make network calls and must not read credentials, keys, tokens or environment secrets. Give each script a one-line purpose.
- assets: templates or files used in the output, under assets/. Usually empty.
- compatibility: tools or runtimes the skill needs, or an empty string.
- Paths are relative to the skill folder, for example references/company-context.md, using letters, digits, dots, dashes and underscores only.

Never invent facts about the person, their company or their numbers. Where context is missing (the gaps list), write clearly marked placeholders such as [Add your company's tone of voice here] in a references/ file, and tell the reader in the body to fill them in.`;

export function buildSplitMessage(input: { description: string; role: string | null; catalog: { slug: string; name: string; description: string }[] }): string {
  const catalog = input.catalog.map((c) => `- ${c.slug}: ${c.name} — ${c.description}`).join("\n");
  return [
    `<work_description>\n${input.description.trim()}\n</work_description>`,
    `<role>\n${input.role?.trim() || "(not given)"}\n</role>`,
    `<catalog>\n${catalog || "(empty)"}\n</catalog>`,
  ].join("\n\n");
}

/** What the scorer reads as the "prompt" for a skill item: its purpose (spec: purpose plus all answers). */
export function skillScoringBase(name: string, purpose: string): string {
  return `Skill: ${name}\nPurpose: ${purpose.trim()}`;
}

export function buildGenerateMessage(input: {
  packDescription: string;
  role: string | null;
  name: string;
  purpose: string;
  questions: PromptQuestionContext[];
}): string {
  const relevant = input.questions.filter((q) => !q.notRelevant);
  const answered = relevant
    .filter((q) => q.answer.trim())
    .map((q) => `Q: ${q.text}\nA: ${q.answer.trim()}`)
    .join("\n\n");
  const gaps = relevant
    .filter((q) => q.score < 3)
    .map((q) => `- ${q.text} (${q.guidance})`)
    .join("\n");
  return [
    `<work_description>\n${input.packDescription.trim()}\n</work_description>`,
    `<role>\n${input.role?.trim() || "(not given)"}\n</role>`,
    `<skill>\nname: ${input.name}\npurpose: ${input.purpose.trim()}\n</skill>`,
    `<answers>\n${answered || "(none)"}\n</answers>`,
    `<gaps>\n${gaps || "(none)"}\n</gaps>`,
  ].join("\n\n");
}

export function buildRetryMessage(original: string, draft: SkillDraft, errors: string[]): string {
  return [
    original,
    `<previous_attempt>\n${JSON.stringify(draft)}\n</previous_attempt>`,
    `<validation_errors>\n${errors.map((e) => `- ${e}`).join("\n")}\n</validation_errors>`,
    "Your previous attempt failed the checks above. Return the complete skill again with every error fixed.",
  ].join("\n\n");
}
