import { prisma } from "@/lib/db/prisma";
import { FormError } from "./form-service";
import type { FormQuestionType } from "@prisma/client";

type Actor = { id: string; role: string };

type QuestionForValidation = {
  id: string;
  type: FormQuestionType;
  required: boolean;
  config: unknown;
};

export type AnswerInput = { questionId: string; value: unknown };

function asConfig(config: unknown): Record<string, unknown> {
  return typeof config === "object" && config !== null ? (config as Record<string, unknown>) : {};
}

// Server-side validation per question type. Client-side validation in the
// fill page is a UX convenience only — this is the actual boundary, since
// nothing stops a direct API call.
export function validateAnswerValue(question: QuestionForValidation, value: unknown): string | null {
  const config = asConfig(question.config);

  switch (question.type) {
    case "SHORT_ANSWER":
    case "PARAGRAPH": {
      if (typeof value !== "string") return "Expected text";
      const maxLength = typeof config.maxLength === "number" ? config.maxLength : undefined;
      if (maxLength && value.length > maxLength) return `Answer exceeds the ${maxLength}-character limit`;
      return null;
    }
    case "MULTIPLE_CHOICE":
    case "DROPDOWN": {
      if (typeof value !== "string") return "Expected a single choice";
      const options = Array.isArray(config.options) ? (config.options as string[]) : [];
      if (!options.includes(value) && !(config.allowOther && value)) return "Not one of the offered choices";
      return null;
    }
    case "CHECKBOXES": {
      if (!Array.isArray(value)) return "Expected a list of choices";
      const options = Array.isArray(config.options) ? (config.options as string[]) : [];
      const invalid = value.some((v) => typeof v !== "string" || (!options.includes(v) && !config.allowOther));
      if (invalid) return "Contains a choice that was not offered";
      const min = typeof config.minSelections === "number" ? config.minSelections : undefined;
      const max = typeof config.maxSelections === "number" ? config.maxSelections : undefined;
      if (min !== undefined && value.length < min) return `Choose at least ${min}`;
      if (max !== undefined && value.length > max) return `Choose at most ${max}`;
      return null;
    }
    case "LINEAR_SCALE":
    case "STAR_RATING": {
      if (typeof value !== "number") return "Expected a number";
      const min = typeof config.min === "number" ? config.min : 1;
      const max = typeof config.max === "number" ? config.max : question.type === "STAR_RATING" ? 5 : 10;
      if (value < min || value > max) return `Expected a value between ${min} and ${max}`;
      return null;
    }
    case "DATE": {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "Expected a valid date";
      return null;
    }
    case "TIME": {
      if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return "Expected a time as HH:MM";
      return null;
    }
    case "FILE_UPLOAD": {
      if (typeof value !== "object" || value === null || typeof (value as { fileId?: unknown }).fileId !== "string") {
        return "Expected an uploaded file reference";
      }
      return null;
    }
    case "MULTIPLE_CHOICE_GRID":
    case "CHECKBOX_GRID": {
      if (typeof value !== "object" || value === null) return "Expected a row-by-row selection";
      const rows = Array.isArray(config.rows) ? (config.rows as string[]) : [];
      const columns = Array.isArray(config.columns) ? (config.columns as string[]) : [];
      for (const [row, cell] of Object.entries(value as Record<string, unknown>)) {
        if (!rows.includes(row)) return `Unknown row: ${row}`;
        if (question.type === "MULTIPLE_CHOICE_GRID") {
          if (typeof cell !== "string" || !columns.includes(cell)) return `Invalid selection for row ${row}`;
        } else {
          if (!Array.isArray(cell) || cell.some((c) => typeof c !== "string" || !columns.includes(c))) {
            return `Invalid selection for row ${row}`;
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

export async function getFormForFilling(actor: Actor | null, formId: string) {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } } },
  });
  if (!form) throw new FormError("Form not found", "NOT_FOUND", 404);

  const isStaffOwner = actor && (actor.role === "ADMIN" || (actor.role === "MENTOR" && actor.id === form.createdById));
  if (form.status !== "PUBLISHED" && !isStaffOwner) {
    throw new FormError("This form is not open", "NOT_PUBLISHED", 403);
  }
  if (form.opensAt && form.opensAt > new Date() && !isStaffOwner) {
    throw new FormError("This form is not open yet", "NOT_OPEN_YET", 403);
  }
  if (form.closesAt && form.closesAt < new Date() && !isStaffOwner) {
    throw new FormError("This form has closed", "CLOSED", 403);
  }
  return form;
}

export async function submitFormResponse(
  actor: Actor,
  formId: string,
  input: { invitationId?: string; answers: AnswerInput[]; anonymous?: boolean }
) {
  const form = await getFormForFilling(actor, formId);
  const questions = form.sections.flatMap((section) => section.questions);
  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const question of questions) {
    if (!question.required) continue;
    const answer = input.answers.find((a) => a.questionId === question.id);
    const isEmpty =
      answer === undefined ||
      answer.value === undefined ||
      answer.value === null ||
      answer.value === "" ||
      (Array.isArray(answer.value) && answer.value.length === 0);
    if (isEmpty) throw new FormError(`"${question.title}" is required`, "REQUIRED_ANSWER_MISSING", 400);
  }

  for (const answer of input.answers) {
    const question = byId.get(answer.questionId);
    if (!question) throw new FormError("Answer references a question not on this form", "UNKNOWN_QUESTION", 400);
    const error = validateAnswerValue(question, answer.value);
    if (error) throw new FormError(`"${question.title}": ${error}`, "INVALID_ANSWER", 400);
  }

  if (!form.allowMultipleSubmissions && !input.anonymous) {
    const existing = await prisma.formResponse.findFirst({
      where: { formId, respondentUserId: actor.id },
    });
    if (existing) throw new FormError("You have already submitted this form", "DUPLICATE_SUBMISSION", 409);
  }

  if (input.invitationId) {
    const invitation = await prisma.formInvitation.findUnique({
      where: { id: input.invitationId },
      include: { response: true },
    });
    if (!invitation) throw new FormError("Invitation not found", "NOT_FOUND", 404);
    if (invitation.recipientUserId !== actor.id) {
      throw new FormError("This invitation is not addressed to you", "FORBIDDEN", 403);
    }
    if (invitation.response) throw new FormError("This invitation has already been submitted", "DUPLICATE_SUBMISSION", 409);
  }

  return prisma.$transaction(async (tx) => {
    const response = await tx.formResponse.create({
      data: {
        formId,
        invitationId: input.invitationId,
        respondentUserId: input.anonymous ? null : actor.id,
        anonymous: input.anonymous ?? false,
        answers: {
          create: input.answers.map((answer) => ({
            questionId: answer.questionId,
            value: answer.value as object,
          })),
        },
      },
      include: { answers: true },
    });

    if (input.invitationId) {
      await tx.formInvitation.update({
        where: { id: input.invitationId },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
    }

    return response;
  });
}
