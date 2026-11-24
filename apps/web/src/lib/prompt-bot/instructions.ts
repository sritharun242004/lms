/**
 * Prompt Bot's instructions to Claude. Bump INSTRUCTIONS_VERSION whenever any
 * text here changes; it is stored on every enhancement for comparison.
 */
export const INSTRUCTIONS_VERSION = "prompt-bot-v1";

export type PromptQuestionContext = {
  id: string;
  text: string;
  guidance: string;
  answer: string;
  score: number;
  notRelevant: boolean;
};

export const DETECT_SYSTEM = `You classify what kind of task a person wants an AI assistant to do, so the right follow-up questions can be shown. Pick the single best matching task kind from the list you are given, or "none" if nothing fits well. Return a confidence between 0 and 1.`;

export const SCORE_SYSTEM = `You assess how well a person's prompt and notes answer a set of Design Think questions. Read everything they wrote as one text: an answer to one question often appears in the prompt or under another question.

Score each question 0-3 against its guidance:
0 = not addressed at all
1 = touched on vaguely
2 = partly answered with some specifics
3 = fully answered as the guidance describes

Give a short, specific reason (under 15 words) that tells the person what is present or missing. Be fair, not generous: a 3 needs the specifics the guidance asks for.`;

export const ENHANCE_SYSTEM = `You are Prompt Bot. You turn a person's basic prompt and their answers to Design Think questions into a complete, well-structured prompt they can paste into any AI assistant.

Write the prompt in Markdown with these sections, in this order, omitting a section only when there is truly nothing for it (Persona and Output expectations are always present):

## Persona
## Context
## Data
## Output expectations
## Iteration request
## Examples

Use only facts from the basic prompt and the answers. Never invent numbers, names, credentials or company details. Where information is missing, write [bracketed placeholders] the person can fill in, such as [target audience] or [deadline]. Address the AI directly ("You are…", "Write…"). Output only the prompt.`;

function relevant(questions: PromptQuestionContext[]) {
  return questions.filter((q) => !q.notRelevant);
}

export function buildScoringText(basePrompt: string, questions: PromptQuestionContext[]): string {
  const notes = relevant(questions)
    .filter((q) => q.answer.trim())
    .map((q) => `${q.text}\n${q.answer.trim()}`)
    .join("\n\n");
  return notes ? `${basePrompt.trim()}\n\nNotes:\n${notes}` : basePrompt.trim();
}

export function buildEnhanceMessage(basePrompt: string, questions: PromptQuestionContext[]): string {
  const rel = relevant(questions);
  const answered = rel
    .filter((q) => q.answer.trim())
    .map((q) => `Q: ${q.text}\nA: ${q.answer.trim()}`)
    .join("\n\n");
  const gaps = rel
    .filter((q) => q.score < 3)
    .map((q) => `- ${q.text} (${q.guidance})`)
    .join("\n");
  return [
    `<basic_prompt>\n${basePrompt.trim()}\n</basic_prompt>`,
    `<answers>\n${answered || "(none)"}\n</answers>`,
    `<gaps>\n${gaps || "(none)"}\n</gaps>`,
  ].join("\n\n");
}
