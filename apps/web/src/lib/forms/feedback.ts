import { prisma } from "@/lib/db/prisma";
import { requireStaff } from "./form-service";

type Actor = { id: string; role: string };

// Per-type FormAnswer.value shapes (see schema.prisma's FormAnswer
// comment) collapsed into one readable string for a table row or an
// export cell — not a faithful re-render of the original question UI,
// just a readable summary.
export function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.fileId === "string") return "[File uploaded]";
    return Object.entries(record)
      .map(([row, cell]) => `${row}: ${Array.isArray(cell) ? cell.join(", ") : String(cell)}`)
      .join("; ");
  }
  return String(value);
}

export type FeedbackSubmission = {
  responseId: string;
  formId: string;
  formTitle: string;
  submittedAt: Date;
  anonymous: boolean;
  respondentName: string | null;
  respondentEmail: string | null;
  answers: { questionId: string; questionTitle: string; value: string }[];
};

// Every FEEDBACK-category form's responses, flattened to one row per
// submission — the detailed, searchable/filterable view the admin
// Feedback table needs, distinct from getFeedbackAggregates' rating
// summaries below (both stay available; neither replaces the other).
export async function listFeedbackSubmissions(
  actor: Actor,
  filters: { formId?: string; q?: string } = {}
): Promise<FeedbackSubmission[]> {
  requireStaff(actor);

  const forms = await prisma.form.findMany({
    where: {
      category: "FEEDBACK",
      ...(filters.formId ? { id: filters.formId } : {}),
      ...(actor.role === "ADMIN" ? {} : { createdById: actor.id }),
    },
    include: {
      sections: { include: { questions: true } },
      responses: {
        orderBy: { submittedAt: "desc" },
        include: { answers: true, respondent: { select: { name: true, email: true } } },
      },
    },
  });

  const submissions = forms.flatMap((form) => {
    const questionTitleById = new Map(
      form.sections.flatMap((s) => s.questions).map((q) => [q.id, q.title] as const)
    );
    return form.responses.map((response) => ({
      responseId: response.id,
      formId: form.id,
      formTitle: form.title,
      submittedAt: response.submittedAt,
      anonymous: response.anonymous,
      respondentName: response.anonymous ? null : response.respondent?.name ?? null,
      respondentEmail: response.anonymous ? null : response.respondent?.email ?? null,
      answers: response.answers.map((answer) => ({
        questionId: answer.questionId,
        questionTitle: questionTitleById.get(answer.questionId) ?? "Unknown question",
        value: formatAnswerValue(answer.value),
      })),
    }));
  });

  const needle = filters.q?.trim().toLowerCase();
  const filtered = needle
    ? submissions.filter(
        (s) =>
          s.formTitle.toLowerCase().includes(needle) ||
          (s.respondentName ?? "").toLowerCase().includes(needle) ||
          (s.respondentEmail ?? "").toLowerCase().includes(needle)
      )
    : submissions;

  return filtered.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
}

export type FeedbackAggregate = {
  targetType: string;
  targetLabel: string;
  responseCount: number;
  averagesByQuestion: { questionId: string; questionTitle: string; average: number }[];
};

// Trainer-wise / session-wise / staff-wise feedback summaries: every
// FEEDBACK-category form gets one row here, labelled by its target when one
// is set and by its title otherwise (the builder has no target field, so
// most forms have none and would otherwise never appear), with the average of its rating-shaped questions
// (LINEAR_SCALE/STAR_RATING) — the master prompt's "trainer-wise,
// session-wise... analytics" requirement, computed generically rather
// than through bespoke per-target tables.
export async function getFeedbackAggregates(actor: Actor): Promise<FeedbackAggregate[]> {
  requireStaff(actor);

  const forms = await prisma.form.findMany({
    where: {
      category: "FEEDBACK",
      // A template is never filled in itself; its copies carry the answers.
      isTemplate: false,
      // Unused copies and drafts would otherwise fill the list with empty rows.
      responses: { some: {} },
      ...(actor.role === "ADMIN" ? {} : { createdById: actor.id }),
    },
    include: {
      sections: { include: { questions: true } },
      responses: { include: { answers: true } },
    },
  });

  return forms.map((form) => {
    const ratingQuestions = form.sections
      .flatMap((s) => s.questions)
      .filter((q) => q.type === "LINEAR_SCALE" || q.type === "STAR_RATING");

    const averagesByQuestion = ratingQuestions.map((question) => {
      const values = form.responses
        .flatMap((r) => r.answers)
        .filter((a) => a.questionId === question.id && typeof a.value === "number")
        .map((a) => a.value as number);
      const average = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
      return { questionId: question.id, questionTitle: question.title, average };
    });

    return {
      targetType: form.feedbackTargetType ?? "GENERAL",
      targetLabel: form.feedbackTargetLabel ?? form.title,
      responseCount: form.responses.length,
      averagesByQuestion,
    };
  });
}
