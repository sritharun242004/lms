import { prisma } from "@/lib/db/prisma";
import { requireStaff, FormError } from "./form-service";

type Actor = { id: string; role: string };

async function requireViewableForm(actor: Actor, formId: string) {
  requireStaff(actor);
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } },
      responses: { include: { answers: true } },
      invitations: true,
    },
  });
  if (!form) throw new FormError("Form not found", "NOT_FOUND", 404);
  if (form.createdById !== actor.id && actor.role !== "ADMIN") {
    throw new FormError("You do not have access to this form's analytics", "FORBIDDEN", 403);
  }
  return form;
}

export type QuestionSummary =
  | { questionId: string; title: string; type: "CHOICE"; counts: Record<string, number> }
  | { questionId: string; title: string; type: "RATING"; average: number; distribution: Record<number, number> }
  | { questionId: string; title: string; type: "TEXT"; answers: string[] };

export async function getFormAnalytics(actor: Actor, formId: string) {
  const form = await requireViewableForm(actor, formId);
  const questions = form.sections.flatMap((s) => s.questions);
  const totalResponses = form.responses.length;
  const completionRate = form.invitations.length > 0 ? totalResponses / form.invitations.length : null;

  const questionSummaries: QuestionSummary[] = questions.map((question) => {
    const values = form.responses.flatMap((r) => r.answers).filter((a) => a.questionId === question.id).map((a) => a.value);

    if (question.type === "LINEAR_SCALE" || question.type === "STAR_RATING") {
      const numbers = values.filter((v): v is number => typeof v === "number");
      const distribution: Record<number, number> = {};
      for (const n of numbers) distribution[n] = (distribution[n] ?? 0) + 1;
      return {
        questionId: question.id,
        title: question.title,
        type: "RATING",
        average: numbers.length ? numbers.reduce((s, n) => s + n, 0) / numbers.length : 0,
        distribution,
      };
    }

    if (
      question.type === "MULTIPLE_CHOICE" ||
      question.type === "DROPDOWN" ||
      question.type === "CHECKBOXES"
    ) {
      const counts: Record<string, number> = {};
      for (const value of values) {
        const options = Array.isArray(value) ? value : [value];
        for (const option of options) {
          if (typeof option !== "string") continue;
          counts[option] = (counts[option] ?? 0) + 1;
        }
      }
      return { questionId: question.id, title: question.title, type: "CHOICE", counts };
    }

    return {
      questionId: question.id,
      title: question.title,
      type: "TEXT",
      answers: values.filter((v): v is string => typeof v === "string"),
    };
  });

  return {
    formId: form.id,
    title: form.title,
    totalResponses,
    invitationsSent: form.invitations.length,
    completionRate,
    questionSummaries,
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function exportFormResponsesCsv(actor: Actor, formId: string): Promise<string> {
  const form = await requireViewableForm(actor, formId);
  const questions = form.sections.flatMap((s) => s.questions);

  const header = ["Response ID", "Submitted At", "Respondent", ...questions.map((q) => q.title)];
  const rows = form.responses.map((response) => {
    const byQuestion = new Map(response.answers.map((a) => [a.questionId, a.value]));
    return [
      response.id,
      response.submittedAt.toISOString(),
      response.anonymous ? "Anonymous" : response.respondentUserId ?? "",
      ...questions.map((q) => cellText(byQuestion.get(q.id))),
    ];
  });

  return [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\n");
}
