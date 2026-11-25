// Starting answers for a fill page. A short answer can carry a pre-filled
// value (e.g. an instructor ID) and/or name a link parameter that fills it
// (e.g. ?location=Chennai). A value from the link wins, since whoever shared
// that link chose it for this audience. Everything stays editable.
type PrefillQuestion = { id: string; type: string; config: unknown };

const MAX_PREFILL_LENGTH = 500;

export function initialAnswers(
  questions: PrefillQuestion[],
  linkParams: Record<string, string | string[] | undefined> = {}
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    if (question.type !== "SHORT_ANSWER") continue;
    const config = typeof question.config === "object" && question.config !== null ? (question.config as Record<string, unknown>) : {};
    const param = typeof config.urlParam === "string" && config.urlParam ? linkParams[config.urlParam] : undefined;
    const fromLink = Array.isArray(param) ? param[0] : param;
    const value = fromLink?.trim() || (typeof config.defaultValue === "string" ? config.defaultValue : "");
    if (!value) continue;
    const maxLength = typeof config.maxLength === "number" ? config.maxLength : MAX_PREFILL_LENGTH;
    answers[question.id] = value.slice(0, Math.min(maxLength, MAX_PREFILL_LENGTH));
  }
  return answers;
}
