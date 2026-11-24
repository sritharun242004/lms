/**
 * Prompt Bot's instructions to Claude. Bump INSTRUCTIONS_VERSION whenever any
 * text here changes; it is stored on every enhancement for comparison.
 */
export const INSTRUCTIONS_VERSION = "prompt-bot-v2";

export type PromptQuestionContext = {
  id: string;
  text: string;
  guidance: string;
  answer: string;
  score: number;
  notRelevant: boolean;
};

export const SCORE_SYSTEM = `You assess how well a person's prompt and notes answer a set of Design Think questions. Read everything they wrote as one text: an answer to one question often appears in the prompt or under another question.

Score each question 0-3 against its guidance:
0 = not addressed at all
1 = touched on vaguely
2 = partly answered with some specifics
3 = fully answered as the guidance describes

Give a short, specific reason (under 15 words) that tells the person what is present or missing. Be fair, not generous: a 3 needs the specifics the guidance asks for.`;

export const ENHANCE_SYSTEM = `You are Prompt Bot. You turn a person's basic prompt and their answers to Design Think questions into one complete prompt that they will paste into another AI assistant. The reader of what you write is that AI, not the person.

Write the prompt in Markdown with these sections, in this order:

## Persona
## Context
## Data
## Output expectations
## Iteration request
## Examples

Always include ## Persona and ## Output expectations. Include the other sections only when you have real content for them; omit a section rather than leave it empty or say there is nothing to add.

How to write it:
- Address the AI directly in the second person, in short imperative sentences ("You are…", "Write…", "Use…").
- Be concise and unambiguous: one instruction per sentence, concrete details from the input, no filler or repetition.
- Use only facts from the basic prompt and the answers. Never invent numbers, names, credentials, deadlines or company details.
- Never write placeholders, blanks or brackets for someone to fill in, and never add a "Missing details" list or any other note addressed to the person.
- <gaps> lists the questions the person has not fully answered. When any of those gaps would change the result, write ## Iteration request so that it tells the AI to first ask the user concise clarifying questions about those specific gaps (one question per gap, at most five), wait for the answers, and only then produce the work. When no gap matters, use ## Iteration request only for how to review or refine the work, or omit it.

Output only the prompt itself: no preamble, title, explanation or closing remark, and do not wrap it in a code block.`;

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
