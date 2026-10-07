import {
  SCALE_DEFAULT_MAX,
  SCALE_MAX_STATEMENTS,
  SCALE_MAX_STATEMENT_LENGTH,
  SCALE_MAX_UPPER_BOUND,
} from "@cms/shared";

export type ScaleStatementDraft = { text: string; max?: number };

export type NormalizedScaleStatement = { text: string; max: number };

/** Validates and trims the statements of a reusable Scale template. */
export function normalizeScaleStatements(input: ScaleStatementDraft[]): NormalizedScaleStatement[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Add at least one statement");
  if (input.length > SCALE_MAX_STATEMENTS) {
    throw new Error(`A scale can have at most ${SCALE_MAX_STATEMENTS} statements`);
  }
  return input.map((statement, index) => {
    const text = String(statement?.text ?? "").trim();
    if (!text) throw new Error(`Statement ${index + 1} is required`);
    if (text.length > SCALE_MAX_STATEMENT_LENGTH) {
      throw new Error(`Statement ${index + 1} must be ${SCALE_MAX_STATEMENT_LENGTH} characters or fewer`);
    }
    const max = statement.max ?? SCALE_DEFAULT_MAX;
    if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > SCALE_MAX_UPPER_BOUND) {
      throw new Error(`Maximum for statement ${index + 1} must be a whole number from 1 to ${SCALE_MAX_UPPER_BOUND}`);
    }
    return { text, max };
  });
}

export type ScaleTemplateDraft = { name: string; statements: ScaleStatementDraft[] };

export function normalizeScaleTemplateDraft(input: ScaleTemplateDraft) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Question name is required");
  const statements = normalizeScaleStatements(input.statements);
  return { name, statements, type: "SCALE" as const, question: statements[0].text };
}

export type PublishedScaleStatement = { id: string; min: number; max: number };

export type ScaleResponseCheck = { ok: true } | { ok: false; message: string };

/**
 * Backend gate for participant answers: each value must be an integer
 * within the *published* statement's own range, belong to this scale, and
 * appear only once. 0 is a legitimate answer, never "unanswered".
 */
export function validateScaleResponses(
  statements: PublishedScaleStatement[],
  responses: { statementId: string; value: number }[]
): ScaleResponseCheck {
  const byId = new Map(statements.map((s) => [s.id, s]));
  const seen = new Set<string>();
  for (const response of responses) {
    const statement = byId.get(response.statementId);
    if (!statement) return { ok: false, message: "Statement does not belong to this scale" };
    if (seen.has(response.statementId)) return { ok: false, message: "Duplicate statement in response" };
    seen.add(response.statementId);
    if (!Number.isInteger(response.value)) return { ok: false, message: "Value must be a whole number" };
    if (response.value < statement.min || response.value > statement.max) {
      return { ok: false, message: `Value must be between ${statement.min} and ${statement.max}` };
    }
  }
  return { ok: true };
}

export type ScaleStatementStats = {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  /** distribution[i] = how many participants chose min + i */
  distribution: number[];
};

export function computeScaleStats(range: { min: number; max: number }, values: number[]): ScaleStatementStats {
  const distribution = Array.from({ length: range.max - range.min + 1 }, () => 0);
  for (const value of values) {
    if (value >= range.min && value <= range.max) distribution[value - range.min] += 1;
  }
  const valid = values.filter((v) => v >= range.min && v <= range.max);
  if (valid.length === 0) return { count: 0, average: null, min: null, max: null, distribution };
  const sum = valid.reduce((total, v) => total + v, 0);
  return {
    count: valid.length,
    average: Math.round((sum / valid.length) * 100) / 100,
    min: Math.min(...valid),
    max: Math.max(...valid),
    distribution,
  };
}
